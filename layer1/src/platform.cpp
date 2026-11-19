#include "platform.h"

#include <chrono>
#include <thread>

#if defined(_WIN32)
#  ifndef NOMINMAX
#    define NOMINMAX
#  endif
#  include <windows.h>
#  include <synchapi.h>
#else
#  include <linux/futex.h>
#  include <sys/syscall.h>
#  include <time.h>
#  include <unistd.h>
#  include <climits>
#endif

namespace l1 {

static thread_local bool t_rt = false;
void set_rt_thread(bool on) { t_rt = on; }
bool is_rt_thread() { return t_rt; }

#if defined(_WIN32)
static int64_t qpc_freq() {
    static const int64_t f = [] { LARGE_INTEGER x; QueryPerformanceFrequency(&x); return (int64_t)x.QuadPart; }();
    return f;
}
int64_t now_ns() {
    LARGE_INTEGER c;
    QueryPerformanceCounter(&c);
    const int64_t f = qpc_freq();
    const int64_t q = c.QuadPart;
    // Split to avoid overflow of q * 1e9.
    return (q / f) * 1000000000LL + ((q % f) * 1000000000LL) / f;
}

void Signal::wait(uint32_t seen, int32_t timeout_ms) {
    waiting_.store(1, std::memory_order_seq_cst);
    uint32_t cur = seq_.load(std::memory_order_seq_cst);
    if (cur == seen) {
        WaitOnAddress((volatile VOID*)&seq_, &seen, sizeof(seen),
                      timeout_ms < 0 ? INFINITE : (DWORD)timeout_ms);
    }
    waiting_.store(0, std::memory_order_relaxed);
}
void Signal::wake() {
    seq_.fetch_add(1, std::memory_order_seq_cst);
    if (waiting_.load(std::memory_order_seq_cst)) WakeByAddressSingle((PVOID)&seq_);
}
#ifndef CREATE_WAITABLE_TIMER_HIGH_RESOLUTION
#define CREATE_WAITABLE_TIMER_HIGH_RESOLUTION 0x00000002
#endif
// Sleep() and std::this_thread::sleep_for round up to the system timer tick
// (15.6 ms by default). A high-resolution waitable timer (Windows 10 1803+)
// sleeps to ~0.5 ms without changing the global timer resolution.
void sleep_us(int64_t us) {
    if (us <= 0) return;
    struct Timer {
        HANDLE h;
        Timer() { h = CreateWaitableTimerExW(nullptr, nullptr, CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, TIMER_ALL_ACCESS); }
        ~Timer() { if (h) CloseHandle(h); }
    };
    static thread_local Timer t;
    if (t.h) {
        LARGE_INTEGER due;
        due.QuadPart = -(LONGLONG)(us * 10);   // relative, 100 ns units
        if (SetWaitableTimer(t.h, &due, 0, nullptr, nullptr, FALSE)) { WaitForSingleObject(t.h, INFINITE); return; }
    }
    std::this_thread::sleep_for(std::chrono::microseconds(us));
}
#else
int64_t now_ns() {
    timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (int64_t)ts.tv_sec * 1000000000LL + ts.tv_nsec;
}

void Signal::wait(uint32_t seen, int32_t timeout_ms) {
    waiting_.store(1, std::memory_order_seq_cst);
    uint32_t cur = seq_.load(std::memory_order_seq_cst);
    if (cur == seen) {
        timespec ts{}, *pts = nullptr;
        if (timeout_ms >= 0) {
            ts.tv_sec = timeout_ms / 1000;
            ts.tv_nsec = (long)(timeout_ms % 1000) * 1000000L;
            pts = &ts;
        }
        syscall(SYS_futex, reinterpret_cast<uint32_t*>(&seq_), FUTEX_WAIT_PRIVATE, seen, pts, nullptr, 0);
    }
    waiting_.store(0, std::memory_order_relaxed);
}
void Signal::wake() {
    seq_.fetch_add(1, std::memory_order_seq_cst);
    if (waiting_.load(std::memory_order_seq_cst))
        syscall(SYS_futex, reinterpret_cast<uint32_t*>(&seq_), FUTEX_WAKE_PRIVATE, 1, nullptr, nullptr, 0);
}
void sleep_us(int64_t us) {
    if (us <= 0) return;
    timespec ts{(time_t)(us / 1000000), (long)((us % 1000000) * 1000)};
    while (nanosleep(&ts, &ts) != 0) {}
}
#endif

} // namespace l1
