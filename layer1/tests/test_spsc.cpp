// T11: ring wrap integrity under concurrency. A producer thread pushes an
// integer sequence in random chunk sizes through a ring whose capacity is not a
// power of two; the consumer reads in different random sizes with random
// pauses. The received sequence must be exact (no loss, reorder or corruption).
#include <atomic>
#include <random>
#include <thread>

#include "check.h"
#include "core.h"
#include "spsc.h"

using namespace l1;

static void ring_sequence(size_t cap, uint64_t total, uint64_t seed, const char* label) {
    SpscRing<uint64_t> r;
    r.init(cap);
    std::atomic<bool> done{false};
    uint64_t produced_wraps = 0;
    std::thread prod([&] {
        std::mt19937_64 rng(seed);
        std::vector<uint64_t> chunk(cap);
        uint64_t next = 0;
        while (next < total) {
            size_t want = 1 + rng() % (cap * 3 / 4);
            size_t n = std::min<size_t>({want, r.free_space(), (size_t)(total - next)});
            if (!n) { std::this_thread::yield(); continue; }
            for (size_t i = 0; i < n; ++i) chunk[i] = next + i;
            r.write(chunk.data(), n);
            r.publish();
            next += n;
        }
        produced_wraps = total / cap;
        done = true;
    });
    std::mt19937_64 rng(seed ^ 0x9e3779b97f4a7c15ULL);
    std::vector<uint64_t> got(cap);
    uint64_t expect = 0, bad = 0;
    while (expect < total) {
        size_t avail = r.available();
        if (!avail) { std::this_thread::yield(); continue; }
        size_t n = std::min<size_t>(avail, 1 + rng() % cap);
        r.peek(got.data(), 0, n);
        r.consume(n);
        for (size_t i = 0; i < n; ++i) if (got[i] != expect + i) ++bad;
        expect += n;
        if ((rng() & 1023) == 0) std::this_thread::sleep_for(std::chrono::microseconds(rng() % 500));
    }
    prod.join();
    CHECKF(bad == 0, "%llu corrupted items", (unsigned long long)bad);
    CHECK(r.available() == 0);
    std::printf("    %s: %llu items, capacity %zu, %llu wraps, corrupted %llu\n", label,
                (unsigned long long)total, cap, (unsigned long long)produced_wraps, (unsigned long long)bad);
}

// Descriptor ring + float ring used together as in the real transport: samples
// published before their descriptor; consumer reads the descriptor then samples.
static void paired_rings(uint64_t total_frames) {
    Transport tr;
    tr.init(1000);
    std::thread prod([&] {
        std::mt19937_64 rng(7);
        std::vector<float> buf(4096);
        int64_t idx = 0;
        while ((uint64_t)idx < total_frames) {
            uint32_t n = 1 + rng() % 600;
            n = (uint32_t)std::min<uint64_t>(n, total_frames - idx);
            if (tr.samples.free_space() < n || tr.packets.free_space() == 0) { std::this_thread::yield(); continue; }
            for (uint32_t i = 0; i < n; ++i) buf[i] = sim_counter_value(idx + i, 0);
            tr.samples.write(buf.data(), n);
            PacketDesc d{}; d.first_index = idx; d.frames = n; d.channels = 1;
            tr.samples.publish();
            tr.packets.write(&d, 1);
            tr.packets.publish();
            idx += n;
        }
    });
    uint64_t got = 0, bad = 0;
    std::vector<float> buf(4096);
    int64_t expect = 0;
    while (got < total_frames) {
        if (!tr.packets.available()) { std::this_thread::yield(); continue; }
        PacketDesc d = tr.packets.front();
        if (d.first_index != expect) ++bad;
        tr.samples.peek(buf.data(), 0, d.frames);
        tr.samples.consume(d.frames);
        tr.packets.consume(1);
        for (uint32_t i = 0; i < d.frames; ++i) if (buf[i] != sim_counter_value(d.first_index + i, 0)) ++bad;
        expect = d.first_index + d.frames;
        got += d.frames;
    }
    prod.join();
    CHECKF(bad == 0, "%llu errors", (unsigned long long)bad);
    std::printf("    paired rings: %llu frames, errors %llu\n", (unsigned long long)total_frames, (unsigned long long)bad);
}

int main() {
    t::begin("T11", "Ring buffer wraps: exact sequence through many wraps");
    ring_sequence(1000, 20000000, 1, "capacity 1000");
    ring_sequence(4097, 20000000, 2, "capacity 4097");
    ring_sequence(3, 2000000, 3, "capacity 3");
    paired_rings(10000000);
    t::end("T11", "Ring buffer wraps", "52M items across capacities 3/1000/4097 + 10M paired sample/descriptor frames, 0 corrupted");
    return t::finish("test_spsc");
}
