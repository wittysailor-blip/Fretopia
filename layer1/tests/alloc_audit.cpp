// Counts heap allocations made on the real-time capture thread (any thread that
// called l1::set_rt_thread(true)). Used for engineering gate 1.
#include <atomic>
#include <cstdlib>
#include <new>

#include "platform.h"

static std::atomic<uint64_t> g_rt_allocs{0};
uint64_t rt_allocations() { return g_rt_allocs.load(); }
void reset_rt_allocations() { g_rt_allocs.store(0); }

static void* do_alloc(std::size_t n) {
    if (l1::is_rt_thread()) g_rt_allocs.fetch_add(1, std::memory_order_relaxed);
    void* p = std::malloc(n ? n : 1);
    if (!p) throw std::bad_alloc();
    return p;
}
void* operator new(std::size_t n) { return do_alloc(n); }
void* operator new[](std::size_t n) { return do_alloc(n); }
void* operator new(std::size_t n, const std::nothrow_t&) noexcept { try { return do_alloc(n); } catch (...) { return nullptr; } }
void* operator new[](std::size_t n, const std::nothrow_t&) noexcept { try { return do_alloc(n); } catch (...) { return nullptr; } }
void operator delete(void* p) noexcept { std::free(p); }
void operator delete[](void* p) noexcept { std::free(p); }
void operator delete(void* p, std::size_t) noexcept { std::free(p); }
void operator delete[](void* p, std::size_t) noexcept { std::free(p); }
