# Using Layer 1 in Unity (Windows)

## 1. Add the plugin

1. Build or download `fretopia_l1.dll` (64-bit). See [README](../README.md#build). The MSVC and MinGW builds both export the same C functions and need only Windows system DLLs.
2. Copy it to `Assets/Plugins/x86_64/fretopia_l1.dll`.
3. In the Inspector for the DLL, tick **Windows x86_64** (Editor and Standalone) and untick everything else.
4. Copy the three files from `layer1/unity/` into `Assets/Scripts/Layer1/`:
   - `Layer1Native.cs`: P/Invoke declarations and struct layouts
   - `Layer1Capture.cs`: engine owner and reader thread
   - `Layer1MicSource.cs`: example MonoBehaviour
5. **Allow 'unsafe' Code** (Project Settings → Player → Other Settings). The bridge reads fixed-size strings from native structs.

Works with Mono and IL2CPP scripting backends. The bridge uses `DllImport("fretopia_l1")` with Cdecl and blittable structs, and no callbacks from native code into managed code.

## 2. Start capturing

The quickest path is to add `Layer1MicSource` to a GameObject. It starts capture in `OnEnable` and stops in `OnDisable`, and shows level and status properties you can bind to UI.

To do it in code:

```csharp
using Fretopia.Audio.Layer1;

var cap = new Layer1Capture();            // checks struct layout against the DLL
cap.Config.RequestRawMode = 1;            // ask Windows to skip voice processing
cap.Config.FrameSize = 256;               // 5.3 ms at 48 kHz
cap.Config.TransportCapacityFrames = 8192;
cap.FrameReceived += (in FrameInfo f, float[] samples) =>
{
    // Runs on the "Layer1 reader" thread, NOT the main thread.
    if (f.Has(FrameFlags.NewEpoch)) layer2.Reset(f.SampleRateHz, f.Channels);
    layer2.Push(in f, samples);           // copy what you keep: the array is reused
};
cap.Start();                              // throws Layer1Exception(Permission) if Windows blocks the mic
```

In `Update()`:

```csharp
cap.PollEvents(e => Debug.Log("[Layer1] " + e));   // device lost / recovered / RAW unavailable ...
var s = cap.GetStats();                              // levels, loss counters, latency percentiles
```

On shutdown: `cap.Dispose()` (`Layer1MicSource` does this in `OnDisable`/`OnApplicationQuit`).

## 3. Threading rules

- **Never read audio from `Update()`.** A slow render frame would stall the reader. T13 on Windows showed a nominal 16 ms frame stretching to 48 ms, enough to lose audio with a small buffer. `Layer1Capture` runs its own reader thread (`AboveNormal` priority) that blocks in `l1_read_frame` and wakes as soon as the capture thread publishes a packet.
- **Layer 2 runs on the reader thread.** Keep each `FrameReceived` call short (a frame arrives every 5.3 ms). For heavier work, copy frames into your own queue and process them on a worker thread. The transport absorbs about 170 ms of stall and then reports loss (`DroppedFramesBefore`, `FrameFlags.Discontinuity`).
- **Hand results to the main thread** through a lock-free or locked queue that `Update()` drains. Do not call Unity APIs from the reader thread.
- Exactly one reader per engine. `Layer1Capture` enforces this.

## 4. Time

`FrameInfo.CaptureTimeNs` is on Layer 1's monotonic clock (QueryPerformanceCounter, in ns), which is not Unity's `Time.time`. To place an audio event on Unity's timeline, sample both clocks together once per frame:

```csharp
long l1Now = Layer1Native.NowNs;                       // same clock as CaptureTimeNs
double unityNow = Time.realtimeSinceStartupAsDouble;   // Unity 2020.2+
double unityTimeOfSample = unityNow - (l1Now - f.SampleTimeNs(i)) * 1e-9;
```

Do not use the time `FrameReceived` fired, or the Unity frame in which you saw the result, as the onset time (spec §3, consumer rules). Use the sample's capture time and add your own measured analysis delay.

## 5. Events to handle

| Event | Suggested UI |
|---|---|
| `Started` | Status "listening", message shows device and format |
| `RawUnavailable` | Optional hint: "Windows audio enhancements are on; quiet notes may be reduced" |
| `DeviceLost` | "Microphone disconnected". Layer 1 retries automatically (`AutoReconnect = 1`) |
| `Recovered` | Resume. Layer 2 sees `NewEpoch` and resets |
| `DefaultChanged` | Layer 1 follows the new default mic (when no `DeviceId` is set) |
| `Error` with `Permission` | Show: Settings → Privacy & security → Microphone → allow desktop apps |

`Layer1Capture.ListDevices()` returns the active microphones for a picker. Set `cap.DeviceId` before `Start()` to pin one. A pinned device does not follow default changes; after loss it is retried until it comes back.

## 6. Editor notes

- Unity loads a native plugin once per Editor session and never unloads it. To replace `fretopia_l1.dll`, close the Editor.
- Domain reloads (entering Play Mode, script recompiles) destroy managed objects. Always `Dispose()` in `OnDisable` so the native engine and its threads stop. `Layer1MicSource` does this, and the finalizer is a safety net.
- The first `Start()` after a Windows privacy prompt can fail with `Permission`. Retry after the user allows access.

## 7. Verifying in your project

- `Layer1Native.CheckLayout()` runs in the `Layer1Capture` constructor and throws if the DLL and the C# structs disagree (API version or any struct size).
- For a no-hardware check, set `cap.Config.Backend = BackendKind.Simulated`. You get a deterministic 48 kHz counter signal with no microphone; `unity/tests/Layer1Smoke.cs` verifies every sample this way.
- Watch `GetStats()`: `FramesDroppedOverflow` should stay 0 in normal play. `CaptureToReadyP99Ms` shows how quickly the reader thread is serviced.
