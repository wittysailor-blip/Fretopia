# Fretopia Layer 1: microphone audio input engine

A real-time, low-latency microphone pipeline for a guitar-learning app:

**microphone → capture → transport → frames with sample index + timestamps + quality flags → Layer 2**

It is written independently from public Windows APIs and the Layer 1 specification. It contains no proprietary code, constants or models.

> **Status: Windows engine built and passing every automated test (Linux, Windows MSVC, Windows MinGW, sanitizers). Not yet run against a real microphone.** See [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) and [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

| Doc | What's in it |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Modules, threads, transport, timeline and timestamp model |
| [docs/LAYER2_INTERFACE.md](docs/LAYER2_INTERFACE.md) | The frame contract Layer 2 builds on |
| [docs/UNITY_INTEGRATION.md](docs/UNITY_INTEGRATION.md) | Adding the DLL and C# bridge to a Unity project |
| [docs/HARDWARE_TESTS.md](docs/HARDWARE_TESTS.md) | Running the microphone tests on Windows with `l1probe` |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision log (D01–D14 plus implementation decisions) |
| [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) | Results, measurements, problems found and fixed |
| [docs/LIMITATIONS.md](docs/LIMITATIONS.md) | What is not done or not proven yet |

## Layout

```
include/l1/l1.h          public C API (the only header a host needs)
src/                     engine, capture adapter, SPSC transport, assembler, WASAPI + simulated backends
tools/l1probe.cpp        microphone test tool (writes RESULTS_TEMPLATE rows)
tests/                   test suites, guitar fixtures (+ SHA256SUMS), allocation audit
unity/                   C# bridge: Layer1Native.cs, Layer1Capture.cs, Layer1MicSource.cs, tests/
cmake/                   MinGW cross-compile toolchain
docs/                    documentation and results (docs/results/*.csv)
```

## Build

You need CMake 3.16+ and a C++20 compiler.

**Windows (Visual Studio 2022):**

```
cmake -S . -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release
:: build\Release\fretopia_l1.dll, l1probe.exe, test_*.exe
```

**Windows DLL from Linux (MinGW-w64):**

```
sudo apt install mingw-w64 ninja-build
cmake -S . -B build-win -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE=cmake/mingw-w64-x86_64.cmake
cmake --build build-win
```

This build links its runtime statically. It imports only `kernel32`, `ole32`, `avrt`, `msvcrt` and `api-ms-win-core-synch`.

**Linux** (simulated device only, for tests):

```
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release && cmake --build build
```

Sanitizer builds: add `-DL1_SANITIZE=thread` or `-DL1_SANITIZE=address,undefined`.

## Test

```
cd tests && mkdir -p results
../build/test_spsc           # T11 ring integrity
../build/test_pipeline       # T04 T08 T09 T10 T12 T24 epochs, ABI sizes
../build/test_conditioning   # T16 T17 T21 T24, DC blocker (guitar fixtures)
../build/test_engine quick   # T01 T05 T06 T07 T12 T13 T15 T26 T29 T30, latency, lifecycle
../build/test_engine long    # T14: 60 minutes of audio at 40x
```

Each suite writes `tests/results/<suite>.csv`. GitHub Actions (`.github/workflows/layer1.yml`) runs:

- the Linux suite, ThreadSanitizer and the Mono C# bridge check;
- MinGW binaries run on Windows, plus a WASAPI smoke test;
- an MSVC build with the full suite on Windows.

On a Windows PC with a microphone:

```
l1probe list
l1probe capture --test T02 --seconds 120 --mic "laptop built-in" --wav t02.wav
```

## Minimal C usage

```c
#include "l1/l1.h"
l1_config cfg; l1_default_config(&cfg);          // default mic, RAW requested, 256-frame frames
l1_engine* e; l1_create(&cfg, &e);
if (l1_start(e) != L1_OK) { /* L1_ERR_PERMISSION, L1_ERR_NO_DEVICE, ... */ }
float buf[256 * 8]; l1_frame_info fi;
while (running) {                                  // on ONE dedicated reader thread
    if (l1_read_frame(e, &fi, buf, 256 * 8, NULL, 0, 100) != L1_OK) continue;
    if (fi.flags & L1_FRAME_NEW_EPOCH) reset_layer2(fi.sample_rate_hz, fi.channels);
    layer2_push(buf, fi.frame_count, fi.first_sample_index, fi.capture_time_ns, fi.flags);
}
l1_stop(e); while (l1_read_frame(e, &fi, buf, 256 * 8, NULL, 0, 0) == L1_OK) layer2_push(...);
l1_destroy(e);
```

## Third-party material

- **Code:** none. Only the C++ standard library and Windows SDK headers/libraries are used.
- **Test fixtures:** guitar notes from the University of Iowa Electronic Music Studios, via tonejs-instruments, CC BY 3.0 (also used by the Fretopia web app).
