// Bounded single-producer / single-consumer ring.
//
// Ownership: the producer is the only writer of write_, the consumer the only
// writer of read_. Counters are 64-bit and never wrap in practice (2^64 items).
// The producer publishes items with a release store of write_; the consumer
// observes them with an acquire load, so every item write made before the
// publish is visible to the consumer. The consumer frees space with a release
// store of read_, observed by the producer with an acquire load, so the
// producer never overwrites an item the consumer is still reading.
//
// All storage is allocated in init(); push/pop never allocate, lock or throw.
#pragma once
#include <algorithm>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <memory>
#include <type_traits>

namespace l1 {

template <typename T>
class SpscRing {
    static_assert(std::is_trivially_copyable<T>::value, "ring items must be trivially copyable");
public:
    void init(size_t capacity) {
        cap_ = capacity;
        buf_.reset(new T[capacity]());
        write_.store(0, std::memory_order_relaxed);
        read_.store(0, std::memory_order_relaxed);
    }
    size_t capacity() const { return cap_; }

    // ---- producer side
    size_t free_space() const {
        const uint64_t w = write_.load(std::memory_order_relaxed);
        const uint64_t r = read_.load(std::memory_order_acquire);
        return cap_ - (size_t)(w - r);
    }
    // Writes exactly n items (caller checked free_space). src == nullptr writes zeros.
    // Items are not visible to the consumer until publish().
    void write(const T* src, size_t n) {
        const uint64_t w = write_.load(std::memory_order_relaxed) + pending_;
        size_t pos = (size_t)(w % cap_);
        size_t first = std::min(n, cap_ - pos);
        if (src) {
            std::memcpy(&buf_[pos], src, first * sizeof(T));
            std::memcpy(&buf_[0], src + first, (n - first) * sizeof(T));
        } else {
            std::memset(&buf_[pos], 0, first * sizeof(T));
            std::memset(&buf_[0], 0, (n - first) * sizeof(T));
        }
        pending_ += n;
    }
    void publish() {
        write_.store(write_.load(std::memory_order_relaxed) + pending_, std::memory_order_release);
        pending_ = 0;
    }

    // ---- consumer side
    size_t available() const {
        const uint64_t r = read_.load(std::memory_order_relaxed);
        const uint64_t w = write_.load(std::memory_order_acquire);
        return (size_t)(w - r);
    }
    // Copies n items starting `offset` items after the read position.
    void peek(T* dst, size_t offset, size_t n) const {
        const uint64_t r = read_.load(std::memory_order_relaxed) + offset;
        size_t pos = (size_t)(r % cap_);
        size_t first = std::min(n, cap_ - pos);
        std::memcpy(dst, &buf_[pos], first * sizeof(T));
        std::memcpy(dst + first, &buf_[0], (n - first) * sizeof(T));
    }
    const T& front() const { return buf_[(size_t)(read_.load(std::memory_order_relaxed) % cap_)]; }
    void consume(size_t n) {
        read_.store(read_.load(std::memory_order_relaxed) + n, std::memory_order_release);
    }

    // ---- either side (approximate when called concurrently)
    size_t size_approx() const {
        return (size_t)(write_.load(std::memory_order_acquire) - read_.load(std::memory_order_acquire));
    }

private:
    std::unique_ptr<T[]> buf_;
    size_t cap_ = 0;
    size_t pending_ = 0;                                  // producer-only
    alignas(64) std::atomic<uint64_t> write_{0};          // producer writes
    alignas(64) std::atomic<uint64_t> read_{0};           // consumer writes
    char pad_[64 - sizeof(std::atomic<uint64_t>)];
};

} // namespace l1
