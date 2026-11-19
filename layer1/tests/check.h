// Minimal test helpers: CHECK macro, result rows written to results/<suite>.csv,
// and a frame-stream verifier that enforces the Layer 1 timeline rules.
#pragma once
#include <algorithm>
#include <cmath>
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "l1/l1.h"
#include "backend.h"   // sim_counter_value

extern uint64_t rt_allocations();   // alloc_audit.cpp
extern void reset_rt_allocations();

namespace t {

inline int& fails() { static int f = 0; return f; }
inline int& case_fails() { static int f = 0; return f; }

#define CHECK(cond)                                                                 \
    do {                                                                            \
        if (!(cond)) {                                                              \
            std::fprintf(stderr, "  FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond);  \
            ++t::fails(); ++t::case_fails();                                        \
        }                                                                           \
    } while (0)

#define CHECKF(cond, ...)                                                           \
    do {                                                                            \
        if (!(cond)) {                                                              \
            std::fprintf(stderr, "  FAIL %s:%d: %s -- ", __FILE__, __LINE__, #cond); \
            std::fprintf(stderr, __VA_ARGS__); std::fprintf(stderr, "\n");          \
            ++t::fails(); ++t::case_fails();                                        \
        }                                                                           \
    } while (0)

struct Row { std::string id, name, result, metrics; };
inline std::vector<Row>& rows() { static std::vector<Row> r; return r; }

inline void begin(const char* id, const char* name) {
    case_fails() = 0;
    std::printf("[%s] %s\n", id, name);
    std::fflush(stdout);
}
inline void end(const char* id, const char* name, const char* fmt = "", ...) {
    char buf[1024];
    va_list ap; va_start(ap, fmt); std::vsnprintf(buf, sizeof buf, fmt, ap); va_end(ap);
    const bool ok = case_fails() == 0;
    std::printf("  %s  %s\n", ok ? "PASS" : "FAIL", buf);
    std::fflush(stdout);
    rows().push_back({id, name, ok ? "PASS" : "FAIL", buf});
}
inline int finish(const char* suite) {
    std::string path = std::string("results/") + suite + ".csv";
    if (FILE* f = std::fopen(path.c_str(), "w")) {
        std::fprintf(f, "id,name,result,metrics\n");
        for (auto& r : rows()) {
            std::string m = r.metrics;
            for (auto& ch : m) if (ch == '"') ch = '\'';
            std::fprintf(f, "%s,\"%s\",%s,\"%s\"\n", r.id.c_str(), r.name.c_str(), r.result.c_str(), m.c_str());
        }
        std::fclose(f);
    }
    std::printf("\n%s: %d check failure(s)\n", suite, fails());
    return fails() ? 1 : 0;
}

// Checks every delivered frame against the timeline contract.
struct Verifier {
    bool check_counter_data = true;   // samples equal the simulator's counter signal
    double ns_per_frame = 0;          // >0: check valid timestamps against truth
    int64_t truth_start_ns = 0;
    int64_t time_tolerance_ns = 0;
    bool keep_time_errors = true;     // false for long runs (memory)
    int64_t time_check_from_index = 0;// skip warm-up frames in accelerated runs

    uint32_t epoch = 0;
    int64_t next_index = -1;
    int64_t last_valid_time = INT64_MIN;
    uint64_t frames = 0, samples = 0, frames_total = 0, dropped_sum = 0, gap_records = 0, epochs = 0;
    uint64_t data_mismatch = 0, index_errors = 0, time_regressions = 0, unflagged_gaps = 0, time_errors = 0;
    uint64_t silent_zeros = 0, partial_frames = 0, silent_frames = 0, estimated = 0, invalid = 0, unknown_gaps = 0;
    double max_time_err_ns = 0;
    std::vector<double> time_err_ns;

    void on_frame(const l1_frame_info& fi, const float* d) {
        ++frames;
        frames_total += fi.frame_count;
        samples += (uint64_t)fi.frame_count * fi.channels;
        if (fi.flags & L1_FRAME_PARTIAL) ++partial_frames;
        if (fi.flags & L1_FRAME_TIMESTAMP_ESTIMATED) ++estimated;
        if (fi.flags & L1_FRAME_TIMESTAMP_INVALID) ++invalid;
        if (fi.stream_epoch != epoch) {
            // New epoch must be flagged and restart the index at a fresh value.
            if (!(fi.flags & L1_FRAME_NEW_EPOCH)) ++index_errors;
            if (epoch != 0 && !(fi.flags & L1_FRAME_DISCONTINUITY)) ++unflagged_gaps;
            if (fi.stream_epoch < epoch) ++index_errors;
            epoch = fi.stream_epoch;
            ++epochs;
            next_index = -1;
            last_valid_time = INT64_MIN;
        } else if (fi.flags & L1_FRAME_NEW_EPOCH) {
            ++index_errors;
        }
        if (next_index >= 0) {
            const int64_t jump = fi.first_sample_index - next_index;
            if (jump < 0) ++index_errors;                                  // went backward
            if (jump > 0 && !(fi.flags & L1_FRAME_DISCONTINUITY)) ++unflagged_gaps;
            if (jump != (int64_t)fi.dropped_frames_before) ++index_errors;  // gap record must match
            if ((fi.flags & L1_FRAME_GAP_LENGTH_UNKNOWN) && !(fi.flags & L1_FRAME_DISCONTINUITY)) ++unflagged_gaps;
        }
        if (fi.flags & L1_FRAME_DISCONTINUITY) ++gap_records;
        if (fi.flags & L1_FRAME_GAP_LENGTH_UNKNOWN) ++unknown_gaps;
        dropped_sum += fi.dropped_frames_before;
        next_index = fi.first_sample_index + fi.frame_count;

        if (!(fi.flags & L1_FRAME_TIMESTAMP_INVALID)) {
            if (fi.capture_time_ns < last_valid_time) ++time_regressions;
            last_valid_time = fi.capture_time_ns;
            if (ns_per_frame > 0 && fi.first_sample_index >= time_check_from_index) {
                const double truth = (double)truth_start_ns + (double)fi.first_sample_index * ns_per_frame;
                const double err = (double)fi.capture_time_ns - truth;
                if (keep_time_errors) time_err_ns.push_back(err);
                if (std::fabs(err) > max_time_err_ns) max_time_err_ns = std::fabs(err);
                if (time_tolerance_ns > 0 && std::fabs(err) > (double)time_tolerance_ns) ++time_errors;
            }
        }
        if (fi.flags & L1_FRAME_SILENT) silent_frames += fi.silent_frames;
        if (check_counter_data) {
            for (uint32_t f = 0; f < fi.frame_count; ++f)
                for (uint32_t c = 0; c < fi.channels; ++c) {
                    const float v = d[(size_t)f * fi.channels + c];
                    const float want = l1::sim_counter_value(fi.first_sample_index + f, c);
                    if (v == want) continue;
                    if ((fi.flags & L1_FRAME_SILENT) && v == 0.0f) { ++silent_zeros; continue; }
                    ++data_mismatch;
                }
        }
    }
    bool clean() const { return data_mismatch == 0 && index_errors == 0 && time_regressions == 0 && unflagged_gaps == 0; }
    void print() const {
        std::printf("    frames=%llu samples=%llu gaps=%llu dropped=%llu epochs=%llu partial=%llu est=%llu inv=%llu "
                    "mismatch=%llu idxerr=%llu treg=%llu unflagged=%llu\n",
                    (unsigned long long)frames, (unsigned long long)samples, (unsigned long long)gap_records,
                    (unsigned long long)dropped_sum, (unsigned long long)epochs, (unsigned long long)partial_frames,
                    (unsigned long long)estimated, (unsigned long long)invalid, (unsigned long long)data_mismatch,
                    (unsigned long long)index_errors, (unsigned long long)time_regressions,
                    (unsigned long long)unflagged_gaps);
    }
};

inline double pct(std::vector<double> v, double p) {
    if (v.empty()) return 0;
    std::sort(v.begin(), v.end());
    size_t i = (size_t)std::min<double>((double)v.size() - 1, std::ceil(p * v.size()) - 1);
    return v[i];
}

} // namespace t
