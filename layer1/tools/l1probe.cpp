// l1probe: real-microphone test tool for Layer 1.
//
//   l1probe list
//   l1probe capture --test T02 --seconds 120 --mic "laptop built-in" --wav t02.wav --csv results.csv
//
// Runs the engine exactly as an app would (dedicated reader thread), checks
// every frame against the timeline rules, prints events and a level report,
// writes a WAV of what was delivered (+ a gap list), and appends one row in the
// RESULTS_TEMPLATE.csv format of the Layer 1 test plan.
#include <atomic>
#include <chrono>
#include <cinttypes>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <string>
#include <thread>
#include <vector>

#include "../tests/check.h"
#include "l1/l1.h"

#if defined(_WIN32)
#include <windows.h>
#endif

uint64_t rt_allocations() { return 0; }
void reset_rt_allocations() {}

namespace {

// ------------------------------------------------------------------ sha256
struct Sha256 {
    uint32_t h[8] = {0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19};
    uint8_t buf[64]; size_t n = 0; uint64_t len = 0;
    static uint32_t r(uint32_t x, int k) { return (x >> k) | (x << (32 - k)); }
    void block(const uint8_t* p) {
        static const uint32_t K[64] = {
            0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,
            0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
            0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,
            0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
            0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,
            0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2};
        uint32_t w[64];
        for (int i = 0; i < 16; ++i) w[i] = (uint32_t)p[4*i] << 24 | p[4*i+1] << 16 | p[4*i+2] << 8 | p[4*i+3];
        for (int i = 16; i < 64; ++i) {
            uint32_t s0 = r(w[i-15],7) ^ r(w[i-15],18) ^ (w[i-15] >> 3), s1 = r(w[i-2],17) ^ r(w[i-2],19) ^ (w[i-2] >> 10);
            w[i] = w[i-16] + s0 + w[i-7] + s1;
        }
        uint32_t a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
        for (int i = 0; i < 64; ++i) {
            uint32_t S1 = r(e,6)^r(e,11)^r(e,25), ch = (e&f)^(~e&g), t1 = hh+S1+ch+K[i]+w[i];
            uint32_t S0 = r(a,2)^r(a,13)^r(a,22), mj = (a&b)^(a&c)^(b&c), t2 = S0+mj;
            hh=g; g=f; f=e; e=d+t1; d=c; c=b; b=a; a=t1+t2;
        }
        h[0]+=a;h[1]+=b;h[2]+=c;h[3]+=d;h[4]+=e;h[5]+=f;h[6]+=g;h[7]+=hh;
    }
    void add(const void* d, size_t k) {
        const uint8_t* p = (const uint8_t*)d; len += k;
        while (k--) { buf[n++] = *p++; if (n == 64) { block(buf); n = 0; } }
    }
    std::string hex() {
        uint64_t bits = len * 8; uint8_t pad = 0x80; add(&pad, 1);
        uint8_t z = 0; while (n != 56) add(&z, 1);
        for (int i = 7; i >= 0; --i) { uint8_t b = (uint8_t)(bits >> (8 * i)); add(&b, 1); }
        char s[65]; for (int i = 0; i < 8; ++i) std::snprintf(s + 8 * i, 9, "%08x", h[i]);
        return s;
    }
};

std::string file_sha256(const std::string& path) {
    FILE* f = std::fopen(path.c_str(), "rb");
    if (!f) return "";
    Sha256 s; uint8_t b[65536]; size_t n;
    while ((n = std::fread(b, 1, sizeof b, f)) > 0) s.add(b, n);
    std::fclose(f);
    return s.hex();
}

// ------------------------------------------------------- float WAV writer
struct WavWriter {
    FILE* f = nullptr; uint32_t rate = 0, ch = 0; uint64_t frames = 0;
    bool open(const std::string& p, uint32_t r, uint32_t c) {
        f = std::fopen(p.c_str(), "wb"); rate = r; ch = c; frames = 0;
        if (!f) return false;
        uint8_t hdr[44] = {}; std::fwrite(hdr, 1, 44, f); return true;
    }
    void write(const float* x, uint32_t n) { if (f) { std::fwrite(x, sizeof(float), (size_t)n * ch, f); frames += n; } }
    void close() {
        if (!f) return;
        auto u32 = [&](uint32_t v) { std::fwrite(&v, 4, 1, f); };
        auto u16 = [&](uint16_t v) { std::fwrite(&v, 2, 1, f); };
        uint32_t data = (uint32_t)(frames * ch * 4);
        std::fseek(f, 0, SEEK_SET);
        std::fwrite("RIFF", 1, 4, f); u32(36 + data); std::fwrite("WAVEfmt ", 1, 8, f);
        u32(16); u16(3); u16((uint16_t)ch); u32(rate); u32(rate * ch * 4); u16((uint16_t)(ch * 4)); u16(32);
        std::fwrite("data", 1, 4, f); u32(data);
        std::fclose(f); f = nullptr;
    }
};

std::string os_version() {
#if defined(_WIN32)
    typedef LONG(WINAPI * RtlGetVersionFn)(OSVERSIONINFOW*);
    OSVERSIONINFOW v{}; v.dwOSVersionInfoSize = sizeof v;
    if (auto fn = (RtlGetVersionFn)(void*)GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "RtlGetVersion")) fn(&v);
    char s[64]; std::snprintf(s, sizeof s, "Windows %lu.%lu.%lu", v.dwMajorVersion, v.dwMinorVersion, v.dwBuildNumber);
    return s;
#else
    return "non-Windows (simulated device)";
#endif
}

std::string csv(const std::string& s) {
    std::string o = "\"";
    for (char c : s) { if (c == '"') o += '"'; o += c; }
    return o + "\"";
}

struct Args {
    std::string cmd, test = "T02", mic, device, wav, csvp = "l1_results.csv", route = "none", ambient, notes, log;
    double seconds = 30, distance = 0;
    uint32_t rate = 0, period = 0, frame = 256, capacity = 8192, fps = 0, stall_ms = 0, load = 0, hum = 0, hum_harm = 1;
    bool dc_block = false; float gain_db = 0;
    bool raw = true, sim = false, expect_hotplug = false, quiet = false;
    l1_channel_mode chmode = L1_CHANNELS_ALL; uint32_t sel = 0;
};

void usage() {
    std::puts(
        "l1probe list\n"
        "l1probe capture [options]\n"
        "  --test ID          test id for the results row (T02, T03, T05, T06, T13, T14, T24 ...)\n"
        "  --seconds N        capture length (default 30)\n"
        "  --device ID        device id from 'list' (default: system default mic)\n"
        "  --rate HZ          request a rate (Windows resamples); default: device rate\n"
        "  --period FRAMES    request a device period\n"
        "  --no-raw           do not request RAW mode\n"
        "  --channels all|select:K|average\n"
        "  --frame N          frame size (default 256)   --capacity N  transport frames (default 8192)\n"
        "  --fps N            read like a game loop at N frames/s instead of a blocking reader (T13)\n"
        "  --stall-ms N       with --fps: one extra stall of N ms every second (T13)\n"
        "  --load N           run N busy CPU threads during capture (T14)\n"
        "  --hotplug          T06: unplug and replug the mic during the run\n"
        "  --dc-block         optional DC blocker   --hum 50|60  mains notch   --hum-harmonics N   --gain-db G\n"
        "                     (--wav then holds the conditioned audio)\n"
        "  --wav FILE         write delivered audio (float32 WAV) + FILE.gaps.csv\n"
        "  --log FILE         per-frame log CSV\n"
        "  --csv FILE         append results row (default l1_results.csv)\n"
        "  --mic TEXT  --route TEXT  --ambient TEXT  --distance CM  --notes TEXT   metadata for the row\n"
        "  --sim              use the simulated device (no hardware)\n");
}

bool parse(int argc, char** argv, Args& a) {
    if (argc < 2) return false;
    a.cmd = argv[1];
    for (int i = 2; i < argc; ++i) {
        std::string k = argv[i];
        auto val = [&](const char* name) -> std::string {
            if (i + 1 >= argc) { std::fprintf(stderr, "missing value for %s\n", name); std::exit(2); }
            return argv[++i];
        };
        if (k == "--test") a.test = val("--test");
        else if (k == "--seconds") a.seconds = std::atof(val("--seconds").c_str());
        else if (k == "--device") a.device = val("--device");
        else if (k == "--rate") a.rate = (uint32_t)std::atoi(val("--rate").c_str());
        else if (k == "--period") a.period = (uint32_t)std::atoi(val("--period").c_str());
        else if (k == "--no-raw") a.raw = false;
        else if (k == "--channels") {
            std::string v = val("--channels");
            if (v == "all") a.chmode = L1_CHANNELS_ALL;
            else if (v == "average") a.chmode = L1_CHANNELS_AVERAGE;
            else if (v.rfind("select:", 0) == 0) { a.chmode = L1_CHANNELS_SELECT; a.sel = (uint32_t)std::atoi(v.c_str() + 7); }
            else return false;
        }
        else if (k == "--frame") a.frame = (uint32_t)std::atoi(val("--frame").c_str());
        else if (k == "--capacity") a.capacity = (uint32_t)std::atoi(val("--capacity").c_str());
        else if (k == "--fps") a.fps = (uint32_t)std::atoi(val("--fps").c_str());
        else if (k == "--stall-ms") a.stall_ms = (uint32_t)std::atoi(val("--stall-ms").c_str());
        else if (k == "--load") a.load = (uint32_t)std::atoi(val("--load").c_str());
        else if (k == "--hotplug") a.expect_hotplug = true;
        else if (k == "--dc-block") a.dc_block = true;
        else if (k == "--hum") a.hum = (uint32_t)std::atoi(val("--hum").c_str());
        else if (k == "--hum-harmonics") a.hum_harm = (uint32_t)std::atoi(val("--hum-harmonics").c_str());
        else if (k == "--gain-db") a.gain_db = (float)std::atof(val("--gain-db").c_str());
        else if (k == "--wav") a.wav = val("--wav");
        else if (k == "--log") a.log = val("--log");
        else if (k == "--csv") a.csvp = val("--csv");
        else if (k == "--mic") a.mic = val("--mic");
        else if (k == "--route") a.route = val("--route");
        else if (k == "--ambient") a.ambient = val("--ambient");
        else if (k == "--distance") a.distance = std::atof(val("--distance").c_str());
        else if (k == "--notes") a.notes = val("--notes");
        else if (k == "--sim") a.sim = true;
        else if (k == "--quiet") a.quiet = true;
        else { std::fprintf(stderr, "unknown option %s\n", k.c_str()); return false; }
    }
    return true;
}

const char* event_name(uint32_t k) {
    switch (k) {
    case L1_EVENT_STARTED: return "STARTED"; case L1_EVENT_STOPPED: return "STOPPED";
    case L1_EVENT_DEVICE_LOST: return "DEVICE_LOST"; case L1_EVENT_DEFAULT_CHANGED: return "DEFAULT_CHANGED";
    case L1_EVENT_FORMAT_CHANGED: return "FORMAT_CHANGED"; case L1_EVENT_ERROR: return "ERROR";
    case L1_EVENT_RECOVERED: return "RECOVERED"; case L1_EVENT_RAW_UNAVAILABLE: return "RAW_UNAVAILABLE";
    case L1_EVENT_PERIOD_ADJUSTED: return "PERIOD_ADJUSTED"; default: return "?";
    }
}

int list() {
    l1_device_info d[32];
    uint32_t n = 0;
    int32_t r = l1_list_devices(d, 32, &n);
    if (r != L1_OK && r != L1_ERR_BUFFER_TOO_SMALL) { std::printf("cannot list devices: %s (%d)\n", l1_result_string(r), r); return 1; }
    if (n == 0) std::puts("no active capture devices");
    for (uint32_t i = 0; i < n && i < 32; ++i)
        std::printf("%s %-40s %6u Hz %u ch\n    id: %s\n", d[i].is_default ? "*" : " ", d[i].name, d[i].mix_sample_rate_hz, d[i].channels, d[i].id);
    return 0;
}

int capture(const Args& a) {
    l1_config cfg;
    l1_default_config(&cfg);
    cfg.backend = a.sim ? L1_BACKEND_SIMULATED : L1_BACKEND_DEFAULT;
    cfg.device_id = a.device.empty() ? nullptr : a.device.c_str();
    cfg.follow_default_device = a.device.empty() ? 1 : 0;
    cfg.requested_sample_rate_hz = a.rate;
    cfg.requested_period_frames = a.period;
    cfg.request_raw_mode = a.raw ? 1 : 0;
    cfg.channel_mode = a.chmode;
    cfg.select_channel = a.sel;
    cfg.frame_size = a.frame;
    cfg.transport_capacity_frames = a.capacity;
    cfg.dc_block = a.dc_block ? 1 : 0;
    cfg.hum_notch_hz = a.hum;
    cfg.hum_notch_harmonics = a.hum_harm;
    cfg.digital_gain_db = a.gain_db;
    l1_engine* e = nullptr;
    int32_t r = l1_create(&cfg, &e);
    if (r != L1_OK) { std::printf("l1_create failed: %s (%d)\n", l1_result_string(r), r); return 1; }
    if (a.sim) {
        l1_sim_config s; l1_default_sim_config(&s); s.signal = 1; s.sine_amplitude = 0.2f;
        l1_set_sim_config(e, &s);
    }
    std::time_t now = std::time(nullptr);
    char utc[32]; std::strftime(utc, sizeof utc, "%Y-%m-%dT%H:%M:%SZ", std::gmtime(&now));
    char run_id[48]; std::snprintf(run_id, sizeof run_id, "%s-%lld", a.test.c_str(), (long long)now);

    std::atomic<bool> burn{a.load > 0};
    std::vector<std::thread> burners;
    for (uint32_t i = 0; i < a.load; ++i)
        burners.emplace_back([&] { volatile double x = 0; while (burn) for (int k = 0; k < 200000; ++k) x += k * 1.0001; });

    r = l1_start(e);
    l1_event ev;
    while (l1_poll_event(e, &ev) == L1_OK) std::printf("[event] %s value=%d detail=0x%llx %s\n", event_name(ev.kind), ev.value, (unsigned long long)ev.detail, ev.message);
    if (r != L1_OK) {
        std::printf("l1_start failed: %s (%d)\n", l1_result_string(r), r);
        if (r == L1_ERR_PERMISSION) std::puts("Windows: Settings > Privacy & security > Microphone > allow desktop apps to access your microphone, then run again.");
        burn = false; for (auto& t : burners) t.join();
        FILE* f = std::fopen(a.csvp.c_str(), "a");
        if (f) {
            std::fprintf(f, "%s,%s,%s,l1probe-0.1,%s,%s,,%s,WASAPI,%u,,,,,%s,%s,%.0f,,,,,,,,,,,,,,,,%s,%s,%s\n",
                         a.test.c_str(), run_id, utc, a.sim ? "sim" : "windows", csv(os_version()).c_str(), csv(a.mic).c_str(), a.rate,
                         csv(a.route).c_str(), csv(a.ambient).c_str(), a.distance,
                         a.test == "T01" ? "PASS" : "FAIL", csv(std::string("start: ") + l1_result_string(r)).c_str(), csv(a.notes).c_str());
            std::fclose(f);
        }
        l1_destroy(e);
        return a.test == "T01" ? 0 : 1;
    }
    if (a.expect_hotplug) std::puts(">>> Unplug the microphone now, wait 3 s, plug it back in. <<<");

    t::Verifier v;
    v.check_counter_data = false;
    WavWriter wav;
    FILE* gaps = nullptr;
    FILE* log = a.log.empty() ? nullptr : std::fopen(a.log.c_str(), "w");
    if (log) std::fprintf(log, "seq,epoch,first_index,frames,flags,capture_time_ns,uncertainty_ns,ready_ns,dropped_before,gap_reason,rms_dbfs,peak_dbfs,noise_floor_dbfs,clipped\n");
    std::vector<float> buf((size_t)a.frame * 8);
    double peak = -240, max_rms = -240, floor_db = 0;
    uint64_t clipped = 0, nonfinite = 0, silent = 0;
    uint32_t rate = 0, ch = 0, epochs_seen = 0;
    bool lost = false, recovered = false;
    const int64_t t_end = l1_now_ns() + (int64_t)(a.seconds * 1e9);
    int64_t next_report = l1_now_ns() + 1000000000LL, next_stall = next_report;

    auto handle = [&](const l1_frame_info& fi) {
        v.on_frame(fi, buf.data());
        if (fi.stream_epoch != (uint32_t)epochs_seen) epochs_seen = fi.stream_epoch;
        if (!wav.f && !a.wav.empty()) {
            wav.open(a.wav, fi.sample_rate_hz, fi.channels);
            gaps = std::fopen((a.wav + ".gaps.csv").c_str(), "w");
            if (gaps) std::fprintf(gaps, "wav_frame,epoch,first_index,dropped_before,gap_reason,flags\n");
        }
        if (wav.f && fi.sample_rate_hz == wav.rate && fi.channels == wav.ch) {
            if (gaps && (fi.flags & (L1_FRAME_DISCONTINUITY | L1_FRAME_NEW_EPOCH)))
                std::fprintf(gaps, "%llu,%u,%lld,%llu,%u,%u\n", (unsigned long long)wav.frames, fi.stream_epoch,
                             (long long)fi.first_sample_index, (unsigned long long)fi.dropped_frames_before, fi.gap_reason, fi.flags);
            wav.write(buf.data(), fi.frame_count);
        }
        rate = fi.sample_rate_hz; ch = fi.channels;
        peak = std::max(peak, (double)fi.peak_dbfs);
        max_rms = std::max(max_rms, (double)fi.rms_dbfs);
        floor_db = fi.noise_floor_dbfs;
        clipped += fi.clipped_samples; nonfinite += fi.nonfinite_samples; silent += fi.silent_frames;
        if (log) std::fprintf(log, "%llu,%u,%lld,%u,%u,%lld,%lld,%lld,%llu,%u,%.2f,%.2f,%.2f,%u\n",
                              (unsigned long long)fi.sequence, fi.stream_epoch, (long long)fi.first_sample_index, fi.frame_count, fi.flags,
                              (long long)fi.capture_time_ns, (long long)fi.timestamp_uncertainty_ns, (long long)fi.ready_time_ns,
                              (unsigned long long)fi.dropped_frames_before, fi.gap_reason, fi.rms_dbfs, fi.peak_dbfs, fi.noise_floor_dbfs, fi.clipped_samples);
    };

    // Reader thread, as an app would run it.
    std::atomic<bool> stop{false};
    std::thread reader([&] {
        l1_frame_info fi;
        if (a.fps) {
            const int64_t frame_ns = 1000000000LL / a.fps;
            while (!stop) {
                int64_t t = l1_now_ns();
                while (l1_read_frame(e, &fi, buf.data(), (uint32_t)buf.size(), nullptr, 0, 0) == L1_OK) handle(fi);
                int64_t sleep_ns = frame_ns - (l1_now_ns() - t);
                if (a.stall_ms && l1_now_ns() >= next_stall) { sleep_ns += a.stall_ms * 1000000LL; next_stall += 1000000000LL; }
                if (sleep_ns > 0) std::this_thread::sleep_for(std::chrono::nanoseconds(sleep_ns));
            }
        } else {
            while (!stop) if (l1_read_frame(e, &fi, buf.data(), (uint32_t)buf.size(), nullptr, 0, 100) == L1_OK) handle(fi);
        }
        while (l1_read_frame(e, &fi, buf.data(), (uint32_t)buf.size(), nullptr, 0, 0) == L1_OK) handle(fi);
    });

    while (l1_now_ns() < t_end) {
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
        while (l1_poll_event(e, &ev) == L1_OK) {
            std::printf("[event] %s value=%d detail=0x%llx %s\n", event_name(ev.kind), ev.value, (unsigned long long)ev.detail, ev.message);
            if (ev.kind == L1_EVENT_DEVICE_LOST) lost = true;
            if (ev.kind == L1_EVENT_RECOVERED) recovered = true;
        }
        if (!a.quiet && l1_now_ns() >= next_report) {
            next_report += 1000000000LL;
            l1_stats s; l1_get_stats(e, &s);
            std::printf("  %6.1f s  epoch %u  %u Hz %uch  delivered %llu  lost %llu  queue %u/%u  cb p99 %.0f us  peak %.1f dBFS  floor %.1f dBFS\n",
                        a.seconds - (t_end - l1_now_ns()) / 1e9, s.stream_epoch, s.sample_rate_hz, s.delivered_channels,
                        (unsigned long long)s.frames_delivered, (unsigned long long)(s.frames_dropped_overflow + s.frames_dropped_device),
                        s.queue_frames_now, s.transport_capacity_frames, s.callback_p99_us, peak, floor_db);
        }
    }
    l1_stats s; l1_get_stats(e, &s);
    l1_stop(e);      // stop capture first: the engine flushes the last partial frame,
    stop = true;     // then the reader drains everything that is left
    reader.join();
    while (l1_poll_event(e, &ev) == L1_OK) std::printf("[event] %s %s\n", event_name(ev.kind), ev.message);
    burn = false; for (auto& t : burners) t.join();
    wav.close();
    if (gaps) std::fclose(gaps);
    if (log) std::fclose(log);
    l1_get_stats(e, &s);

    const double secs = rate ? (double)v.frames_total / rate : 0;
    const double eff_rate = 0;   (void)eff_rate;
    std::printf("\n== %s summary ==\n", a.test.c_str());
    std::printf("format: %u Hz, %u delivered ch (device %u ch), period %u frames, device buffer %u, RAW %s\n",
                s.sample_rate_hz, s.delivered_channels, s.device_channels, s.actual_period_frames, s.device_buffer_frames, s.raw_mode_active ? "on" : "off");
    std::printf("frames: received %llu, delivered %llu (%.1f s), dropped overflow %llu, device-lost %llu, duplicates %llu\n",
                (unsigned long long)s.frames_received, (unsigned long long)s.frames_delivered, secs,
                (unsigned long long)s.frames_dropped_overflow, (unsigned long long)s.frames_dropped_device, (unsigned long long)s.frames_duplicate_discarded);
    std::printf("flags: glitches %llu, timestamp errors %llu, silent packets %llu, gap records %llu, epochs %llu\n",
                (unsigned long long)s.device_glitches, (unsigned long long)s.timestamp_errors, (unsigned long long)s.silent_packets,
                (unsigned long long)v.gap_records, (unsigned long long)v.epochs);
    std::printf("timeline check: index errors %llu, unflagged gaps %llu, time regressions %llu -> %s\n",
                (unsigned long long)v.index_errors, (unsigned long long)v.unflagged_gaps, (unsigned long long)v.time_regressions,
                v.clean() ? "OK" : "VIOLATION");
    std::printf("timing: callback p50 %.0f us p99 %.0f us max %.0f us, overruns %llu; last-sample->frame p50 %.2f p95 %.2f p99 %.2f max %.2f ms\n",
                s.callback_p50_us, s.callback_p99_us, s.callback_max_us, (unsigned long long)s.callback_overruns,
                s.capture_to_ready_p50_ms, s.capture_to_ready_p95_ms, s.capture_to_ready_p99_ms, s.capture_to_ready_max_ms);
    std::printf("clock: device vs QPC drift %+.1f ppm, packet timestamp jitter %.0f us RMS; queue high-water %u of %u frames\n",
                s.clock_drift_ppm, s.timestamp_jitter_us, s.queue_high_water_frames, s.transport_capacity_frames);
    std::printf("levels: peak %.1f dBFS, loudest frame RMS %.1f dBFS, noise floor %.1f dBFS, clipped samples %llu, non-finite %llu\n",
                peak, max_rms, floor_db, (unsigned long long)clipped, (unsigned long long)nonfinite);
    if (clipped) std::puts("  -> input is clipping: lower the microphone level in Windows Sound settings.");
    else if (peak < -30) std::puts("  -> input is quiet: raise the microphone level or move the mic closer.");
    else std::puts("  -> input level looks usable.");
    if (floor_db > -50) std::puts("  -> background noise is high for quiet notes; check fans, AC or OS noise suppression.");

    // Pass/fail for the correctness gates this run can judge.
    bool pass = v.clean() && s.frames_delivered > 0;
    std::string why;
    if (!v.clean()) why += "timeline violation; ";
    if (a.test == "T02" || a.test == "T03" || a.test == "T14") {
        if (s.frames_dropped_overflow) { pass = false; why += "transport overflow; "; }
        const double expect = a.seconds * s.sample_rate_hz;
        if (s.frames_received < expect * 0.98) { pass = false; why += "fewer frames than wall-clock time; "; }
    }
    if (a.test == "T06" && !(lost && recovered && v.epochs >= 2)) { pass = false; why += "no loss+recovery observed; "; }
    if (!a.wav.empty()) std::printf("wav: %s (%llu frames) sha256 %s; gaps listed in %s.gaps.csv\n", a.wav.c_str(),
                                    (unsigned long long)wav.frames, file_sha256(a.wav).c_str(), a.wav.c_str());
    std::printf("result: %s %s\n", pass ? "PASS" : "FAIL", why.c_str());

    bool header = false;
    if (FILE* t = std::fopen(a.csvp.c_str(), "r")) std::fclose(t); else header = true;
    if (FILE* f = std::fopen(a.csvp.c_str(), "a")) {
        if (header) std::fprintf(f, "test_id,run_id,utc_date,app_build,platform,os_version,device_model,microphone_type,driver_backend,requested_sample_rate_hz,actual_sample_rate_hz,actual_period_frames,channels,raw_mode_or_effects,playback_route,ambient_condition,guitar_distance_cm,raw_fixture_sha256,stream_epoch,observed_frames,dropped_frames,discontinuities,timestamp_error_count,queue_high_water_frames,callback_p50_ms,callback_p99_ms,capture_to_frame_p95_ms,capture_to_event_p95_ms,ui_end_to_end_p95_ms,quiet_note_attenuation_db,bleed_attenuation_db,false_events,missed_events,pass_fail,failure_reason,notes\n");
        std::fprintf(f, "%s,%s,%s,l1probe-0.1,%s,%s,,%s,%s,%u,%u,%u,%u,%s,%s,%s,%.0f,%s,%u,%llu,%llu,%llu,%llu,%u,%.3f,%.3f,%.2f,,,,,,,%s,%s,%s\n",
                     a.test.c_str(), run_id, utc, a.sim ? "sim" : "windows", csv(os_version()).c_str(), csv(a.mic).c_str(),
                     a.sim ? "simulated" : "WASAPI shared event", a.rate, s.sample_rate_hz, s.actual_period_frames, s.delivered_channels,
                     s.raw_mode_active ? "RAW" : "default effects", csv(a.route).c_str(), csv(a.ambient).c_str(), a.distance,
                     a.wav.empty() ? "" : file_sha256(a.wav).c_str(), s.stream_epoch, (unsigned long long)s.frames_delivered,
                     (unsigned long long)(s.frames_dropped_overflow + s.frames_dropped_device), (unsigned long long)v.gap_records,
                     (unsigned long long)s.timestamp_errors, s.queue_high_water_frames, s.callback_p50_us / 1000, s.callback_p99_us / 1000,
                     s.capture_to_ready_p95_ms, pass ? "PASS" : "FAIL", csv(why).c_str(), csv(a.notes).c_str());
        std::fclose(f);
        std::printf("results row appended to %s\n", a.csvp.c_str());
    }
    l1_destroy(e);
    return pass ? 0 : 1;
}

} // namespace

int main(int argc, char** argv) {
    Args a;
    if (!parse(argc, argv, a)) { usage(); return 2; }
    if (a.cmd == "list") return list();
    if (a.cmd == "capture") return capture(a);
    usage();
    return 2;
}
