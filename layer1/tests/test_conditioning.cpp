// Stage B: guitar signal preservation through the whole engine (simulated
// device playing recorded guitar notes). T16, T17, T21, T24 and the D08
// decision: conditioning is off by default and every stage is measured.
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

#include "check.h"

struct Wav { std::vector<float> x; uint32_t rate = 0; };

static Wav load_wav(const std::string& path) {
    Wav w;
    FILE* f = std::fopen(path.c_str(), "rb");
    if (!f) return w;
    std::vector<uint8_t> b;
    uint8_t tmp[65536];
    size_t n;
    while ((n = std::fread(tmp, 1, sizeof tmp, f)) > 0) b.insert(b.end(), tmp, tmp + n);
    std::fclose(f);
    size_t p = 12;
    uint16_t fmt = 0, ch = 0, bits = 0;
    while (p + 8 <= b.size()) {
        uint32_t sz = b[p + 4] | b[p + 5] << 8 | b[p + 6] << 16 | (uint32_t)b[p + 7] << 24;
        if (!std::memcmp(&b[p], "fmt ", 4)) {
            fmt = b[p + 8] | b[p + 9] << 8; ch = b[p + 10] | b[p + 11] << 8;
            w.rate = b[p + 12] | b[p + 13] << 8 | b[p + 14] << 16 | (uint32_t)b[p + 15] << 24;
            bits = b[p + 22] | b[p + 23] << 8;
        } else if (!std::memcmp(&b[p], "data", 4) && fmt == 1 && bits == 16 && ch == 1) {
            for (size_t i = 0; i + 1 < sz && p + 8 + i + 1 < b.size(); i += 2)
                w.x.push_back((int16_t)(b[p + 8 + i] | b[p + 9 + i] << 8) / 32768.0f);
        }
        p += 8 + sz + (sz & 1);
    }
    return w;
}

// Runs a signal through the engine and returns the delivered samples by index.
struct Out { std::vector<float> data, raw; uint64_t clipped = 0; bool exact_raw = true; float min_rms = 0; uint32_t flags_or = 0; };

static Out run_engine(const std::vector<float>& sig, const l1_config& base) {
    Out o;
    l1_config cfg = base;
    cfg.backend = L1_BACKEND_SIMULATED;
    cfg.request_raw_mode = 0;
    cfg.transport_capacity_frames = (uint32_t)sig.size() + 8192;
    l1_sim_config sim;
    l1_default_sim_config(&sim);
    sim.signal = 3;
    sim.file_samples = sig.data();
    sim.file_frames = sig.size();
    sim.total_frames = sig.size();
    sim.realtime = 0;
    sim.min_packet_frames = 1;
    sim.max_packet_frames = 1500;
    l1_engine* e = nullptr;
    if (l1_create(&cfg, &e) != L1_OK || l1_set_sim_config(e, &sim) != L1_OK || l1_start(e) != L1_OK) return o;
    o.data.assign(sig.size(), NAN);
    o.raw.assign(sig.size(), NAN);
    std::vector<float> d(cfg.frame_size), r(cfg.frame_size);
    l1_frame_info fi;
    int idle = 0;
    for (;;) {
        int32_t rc = l1_read_frame(e, &fi, d.data(), (uint32_t)d.size(), r.data(), (uint32_t)r.size(), 50);
        if (rc == L1_TIMEOUT) { if (++idle > 4) break; continue; }
        idle = 0;
        o.clipped += fi.clipped_samples;
        o.flags_or |= fi.flags;
        for (uint32_t i = 0; i < fi.frame_count; ++i) {
            o.data[fi.first_sample_index + i] = d[i];
            o.raw[fi.first_sample_index + i] = r[i];
        }
    }
    l1_destroy(e);
    for (size_t i = 0; i < sig.size(); ++i) if (o.raw[i] != sig[i]) o.exact_raw = false;
    return o;
}

static double goertzel_db(const std::vector<float>& x, size_t a, size_t b, double f, double fs) {
    const double w = 2 * M_PI * f / fs, c = 2 * std::cos(w);
    double s1 = 0, s2 = 0;
    for (size_t i = a; i < b && i < x.size(); ++i) { double s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; }
    const double p = s1 * s1 + s2 * s2 - c * s1 * s2;
    return 10 * std::log10(p / ((double)(b - a) * (b - a)) + 1e-30);
}
static double rms_db(const std::vector<float>& x, size_t a, size_t b) {
    double s = 0; for (size_t i = a; i < b && i < x.size(); ++i) s += (double)x[i] * x[i];
    return 10 * std::log10(s / (double)(b - a) + 1e-30);
}
static size_t onset(const std::vector<float>& x) {
    float pk = 0; for (float v : x) pk = std::max(pk, std::fabs(v));
    for (size_t i = 0; i < x.size(); ++i) if (std::fabs(x[i]) > 0.1f * pk) return i;
    return 0;
}
static double peak_db(const std::vector<float>& x, size_t a, size_t b) {
    float pk = 0; for (size_t i = a; i < b && i < x.size(); ++i) pk = std::max(pk, std::fabs(x[i]));
    return 20 * std::log10(pk + 1e-30);
}

// Plucked-string model (Karplus-Strong) for a 10 s sustained low E.
static std::vector<float> sustained_e2(double seconds, double level) {
    const double fs = 48000, f = 82.41;
    size_t N = (size_t)(fs / f);
    std::vector<double> line(N);
    uint32_t s = 12345;
    for (auto& v : line) { s = s * 1664525u + 1013904223u; v = ((s >> 9) / 4194304.0 - 1.0); }
    double mean = 0; for (double v : line) mean += v; mean /= (double)N;
    for (auto& v : line) v -= mean;   // a vibrating string has no DC component
    std::vector<float> out((size_t)(fs * seconds));
    size_t k = 0;
    for (auto& o : out) {
        size_t j = (k + 1) % N;
        double y = 0.4993 * (line[k] + line[j]);   // slow decay: ~60 dB over 10 s
        o = (float)(line[k] * level);
        line[k] = y;
        k = j;
    }
    return out;
}

int main() {
    const char* notes[] = {"E2", "A2", "D3", "G3", "B3", "E4"};
    const double f0[] = {82.41, 110.0, 146.83, 196.0, 246.94, 329.63};
    l1_config def;
    l1_default_config(&def);

    // ---------------------------------------------------------------- T16
    t::begin("T16", "Clean guitar plucks: waveform and transients delivered bit-exact (default settings)");
    std::string m16;
    for (int i = 0; i < 6; ++i) {
        Wav w = load_wav(std::string("fixtures/guitar_") + notes[i] + ".wav");
        CHECKF(!w.x.empty() && w.rate == 48000, "missing fixture %s (run make_fixtures.sh)", notes[i]);
        if (w.x.empty()) continue;
        Out o = run_engine(w.x, def);
        bool exact = true;
        for (size_t k = 0; k < w.x.size(); ++k) if (o.data[k] != w.x[k]) { exact = false; break; }
        CHECKF(exact && o.exact_raw, "%s not bit-exact", notes[i]);
        CHECK(!(o.flags_or & L1_FRAME_CONDITIONED));
        m16 += std::string(notes[i]) + (exact ? " exact; " : " DIFFERS; ");
    }
    t::end("T16", "Clean plucks", "%s6 open strings, %u samples each, through capture->transport->frames", m16.c_str(), 201600u);

    // ---------------------------------------------------------------- T17
    t::begin("T17", "Quiet and sustained notes: no gate, no truncation");
    {
        Wav w = load_wav("fixtures/guitar_G3.wav");
        float pk = 0; for (float v : w.x) pk = std::max(pk, std::fabs(v));
        const float k = std::pow(10.0f, -50.0f / 20.0f) / pk;   // soft pluck peaking at -50 dBFS
        for (auto& v : w.x) v *= k;
        Out o = run_engine(w.x, def);
        bool exact = true; for (size_t i = 0; i < w.x.size(); ++i) if (o.data[i] != w.x[i]) exact = false;
        CHECK(exact);
        auto s = sustained_e2(10.0, 0.3);
        Out q = run_engine(s, def);
        bool exact2 = true; for (size_t i = 0; i < s.size(); ++i) if (q.data[i] != s[i]) exact2 = false;
        CHECK(exact2);
        const double tail_in = rms_db(s, s.size() - 48000, s.size()), tail_out = rms_db(q.data, s.size() - 48000, s.size());
        CHECK(std::fabs(tail_in - tail_out) < 1e-9);
        // With conditioning on (DC blocker + 50 Hz notch) the tail must survive too.
        l1_config c = def; c.dc_block = 1; c.hum_notch_hz = 50;
        Out q2 = run_engine(s, c);
        const double tail_c = rms_db(q2.data, s.size() - 48000, s.size());
        const double f0_in = goertzel_db(s, s.size() - 48000, s.size(), 82.41, 48000);
        const double f0_c = goertzel_db(q2.data, s.size() - 48000, s.size(), 82.41, 48000);
        CHECK(std::fabs(tail_in - tail_c) < 0.5);
        CHECK(std::fabs(f0_in - f0_c) < 0.1);
        t::end("T17", "Quiet/sustained", "-50 dBFS pluck bit-exact; 10 s low-E sustain bit-exact, last-second level %.1f dB in = %.1f dB out; with DC blocker + 50 Hz notch %.2f dB (82.4 Hz component %+.3f dB)",
               tail_in, tail_out, tail_c, f0_c - f0_in);
    }

    // ------------------------------------------------- D08 / DC blocker
    t::begin("D08-DC", "Optional DC blocker (5 Hz): removes offset, keeps low strings and attacks");
    {
        std::string m;
        double worst_f0 = 0, worst_pk = 0;
        l1_config c = def; c.dc_block = 1;
        for (int i = 0; i < 6; ++i) {
            Wav w = load_wav(std::string("fixtures/guitar_") + notes[i] + ".wav");
            if (w.x.empty()) continue;
            for (auto& v : w.x) v += 0.05f;   // DC offset from a cheap interface
            Out o = run_engine(w.x, c);
            std::vector<float> ref = w.x; for (auto& v : ref) v -= 0.05f;
            size_t on = onset(ref);
            const double d_f0 = goertzel_db(o.data, on, o.data.size(), f0[i], 48000) - goertzel_db(ref, on, ref.size(), f0[i], 48000);
            const double d_pk = peak_db(o.data, on, on + 2400) - peak_db(ref, on, on + 2400);
            double mean = 0; for (size_t k = o.data.size() - 48000; k < o.data.size(); ++k) mean += o.data[k];
            mean /= 48000;
            CHECK(std::fabs(mean) < 1e-3);
            worst_f0 = std::max(worst_f0, std::fabs(d_f0));
            worst_pk = std::max(worst_pk, std::fabs(d_pk));
            char row[96]; std::snprintf(row, sizeof row, "%s f0 %+.3f dB attack %+.2f dB; ", notes[i], d_f0, d_pk); m += row;
        }
        CHECK(worst_f0 < 0.1);
        CHECK(worst_pk < 0.6);
        t::end("D08-DC", "DC blocker", "%s0.05 DC offset removed (<1e-3 after 3 s)", m.c_str());
    }

    // ---------------------------------------------------------------- T21
    t::begin("T21", "50 Hz mains hum: bypass vs targeted notch, low strings preserved");
    {
        Wav w = load_wav("fixtures/guitar_E2.wav");
        std::vector<float> hum = w.x;
        for (size_t i = 0; i < hum.size(); ++i) hum[i] += 0.03f * (float)std::sin(2 * M_PI * 50.0 * i / 48000.0);
        Out byp = run_engine(hum, def);
        l1_config c = def; c.hum_notch_hz = 50; c.hum_notch_harmonics = 1;
        Out n = run_engine(hum, c);
        const size_t a = 24000, b = hum.size();
        const double hum_in = goertzel_db(byp.data, a, b, 50, 48000), hum_out = goertzel_db(n.data, a, b, 50, 48000);
        const double e_in = goertzel_db(w.x, a, b, 82.41, 48000), e_out = goertzel_db(n.data, a, b, 82.41, 48000);
        const double h2_in = goertzel_db(w.x, a, b, 164.82, 48000), h2_out = goertzel_db(n.data, a, b, 164.82, 48000);
        CHECK(hum_in - hum_out > 20);
        CHECK(std::fabs(e_out - e_in) < 0.3);
        CHECK(std::fabs(h2_out - h2_in) < 0.3);
        // Risk measurement: notching hum harmonics near guitar notes.
        auto tone = [](double f) { std::vector<float> x(96000); for (size_t i = 0; i < x.size(); ++i) x[i] = 0.3f * (float)std::sin(2 * M_PI * f * i / 48000.0); return x; };
        auto g2 = tone(98.0), b2 = tone(123.47), a2 = tone(110.0);
        l1_config c3 = def; c3.hum_notch_hz = 50; c3.hum_notch_harmonics = 3;    // 50/100/150
        l1_config c60 = def; c60.hum_notch_hz = 60; c60.hum_notch_harmonics = 2; // 60/120
        Out og = run_engine(g2, c3), ob = run_engine(b2, c60), oa = run_engine(a2, c3);
        const double att_g2 = goertzel_db(og.data, 48000, 96000, 98.0, 48000) - goertzel_db(g2, 48000, 96000, 98.0, 48000);
        const double att_b2 = goertzel_db(ob.data, 48000, 96000, 123.47, 48000) - goertzel_db(b2, 48000, 96000, 123.47, 48000);
        const double att_a2 = goertzel_db(oa.data, 48000, 96000, 110.0, 48000) - goertzel_db(a2, 48000, 96000, 110.0, 48000);
        std::printf("    harmonic notches: G2 98 Hz %+.2f dB (50x3), B2 123.5 Hz %+.2f dB (60x2), A2 110 Hz %+.2f dB (50x3)\n", att_g2, att_b2, att_a2);
        t::end("T21", "Mains hum", "single 50 Hz notch: hum %.1f -> %.1f dB (-%.1f dB), E2 fundamental %+.2f dB, 2nd harmonic %+.2f dB. Harmonic notches cost G2 (98 Hz) %+.2f dB, B2 (123.5 Hz, 60 Hz mains) %+.2f dB, A2 %+.2f dB -> default 1 notch, harmonics opt-in",
               hum_in, hum_out, hum_in - hum_out, e_out - e_in, h2_out - h2_in, att_g2, att_b2, att_a2);
    }

    // --------------------------------------------------------- T24 levels
    t::begin("T24-levels", "Input level: low / normal / overload reported per frame");
    {
        Wav w = load_wav("fixtures/guitar_A2.wav");
        float pk = 0; for (float v : w.x) pk = std::max(pk, std::fabs(v));
        std::string m;
        const double gains[] = {-40, -6, +12};
        for (double g : gains) {
            std::vector<float> x = w.x;
            const float k = (float)std::pow(10.0, g / 20.0) / pk;
            for (auto& v : x) v = std::clamp(v * k, -1.0f, 1.0f);   // what a saturating ADC delivers
            Out o = run_engine(x, def);
            char row[96]; std::snprintf(row, sizeof row, "peak %+.0f dBFS: %llu clipped; ", g, (unsigned long long)o.clipped); m += row;
            if (g > 0) CHECK(o.clipped > 100 && (o.flags_or & L1_FRAME_CLIPPED));
            else CHECK(o.clipped == 0);
        }
        t::end("T24-levels", "Levels", "%s", m.c_str());
    }
    return t::finish("test_conditioning");
}
