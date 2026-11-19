// Monotonic clock, real-time thread marker and a non-blocking wake primitive.
#pragma once
#include <atomic>
#include <cstdint>

namespace l1 {

// Monotonic nanoseconds. On Windows this is QueryPerformanceCounter converted
// to ns, the same timebase WASAPI uses for packet QPC positions.
int64_t now_ns();

// Marks the calling thread as the real-time capture thread for the allocation
// audit used by tests (operator new counts allocations made while set).
void set_rt_thread(bool on);
bool is_rt_thread();

// Single waiter / single waker. wake() never blocks and never allocates:
// futex on Linux, WakeByAddressSingle on Windows. Spurious wakeups allowed.
class Signal {
public:
    // Consumer: wait until seq changes from `seen` or timeout (ms, <0 = forever).
    void wait(uint32_t seen, int32_t timeout_ms);
    uint32_t load() const { return seq_.load(std::memory_order_acquire); }
    // Producer: bump the sequence and wake the waiter if one is parked.
    void wake();
private:
    std::atomic<uint32_t> seq_{0};
    std::atomic<uint32_t> waiting_{0};
};

void sleep_us(int64_t us);

} // namespace l1
