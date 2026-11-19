// P/Invoke declarations for fretopia_l1 (Layer 1 microphone engine).
// Struct layouts mirror include/l1/l1.h exactly (sequential, natural alignment);
// sizes are checked at startup by Layer1Native.CheckLayout().
using System;
using System.Runtime.InteropServices;

namespace Fretopia.Audio.Layer1
{
    public enum L1Result : int
    {
        Ok = 0, Timeout = 1, InvalidArg = -1, NoDevice = -2, Permission = -3, Format = -4,
        DeviceLost = -5, Backend = -6, State = -7, BufferTooSmall = -8, NotSupported = -9, DeviceInUse = -10
    }

    [Flags]
    public enum FrameFlags : uint
    {
        None = 0,
        Discontinuity = 1u << 0,
        NewEpoch = 1u << 1,
        TimestampEstimated = 1u << 2,
        TimestampInvalid = 1u << 3,
        Silent = 1u << 4,
        Partial = 1u << 5,
        Clipped = 1u << 6,
        NonFinite = 1u << 7,
        Conditioned = 1u << 8,
        GapLengthUnknown = 1u << 9,
        DuplicatesRemoved = 1u << 10,
        LastOfEpoch = 1u << 11
    }

    public enum GapReason : uint { None = 0, DeviceGlitch = 1, DevicePositionJump = 2, TransportOverflow = 3, StreamRestart = 4, DeviceReset = 5 }
    public enum TimestampSource : uint { None = 0, DeviceQpc = 1, Simulated = 2, HostArrival = 3, File = 4 }
    public enum ChannelMode : int { All = 0, Select = 1, Average = 2 }
    public enum BackendKind : int { Default = 0, Wasapi = 1, Simulated = 2 }
    public enum EventKind : uint
    {
        None = 0, Started = 1, Stopped = 2, DeviceLost = 3, DefaultChanged = 4, FormatChanged = 5,
        Error = 6, Recovered = 7, RawUnavailable = 8, PeriodAdjusted = 9
    }
    public enum EngineState : uint { Stopped = 0, Running = 1, Recovering = 2, Failed = 3 }

    [StructLayout(LayoutKind.Sequential)]
    public struct L1Config
    {
        public uint ApiVersion;
        public uint StructSize;
        public BackendKind Backend;
        public IntPtr DeviceId;            // UTF-8, set via Layer1Capture.DeviceId
        public uint FollowDefaultDevice;
        public uint AutoReconnect;
        public uint RequestedSampleRateHz;
        public uint RequestedPeriodFrames;
        public uint RequestRawMode;
        public ChannelMode ChannelMode;
        public uint SelectChannel;
        public uint TransportCapacityFrames;
        public uint FrameSize;
        public uint DcBlock;
        public float DcBlockHz;
        public uint HumNotchHz;
        public uint HumNotchHarmonics;
        public float DigitalGainDb;
        public float ClipThreshold;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct FrameInfo
    {
        public uint ApiVersion;
        public uint StructSize;
        public ulong StreamId;
        public uint StreamEpoch;
        public uint SampleRateHz;
        public ushort Channels;
        public ushort ChannelMode;
        public uint SampleFormat;
        public long FirstSampleIndex;
        public uint FrameCount;
        public FrameFlags Flags;
        public long CaptureTimeNs;
        public long TimestampUncertaintyNs;
        public TimestampSource TimestampSource;
        public GapReason GapReason;
        public ulong DroppedFramesBefore;
        public ulong Sequence;
        public long ReadyTimeNs;
        public float RmsDbfs;
        public float PeakDbfs;
        public float NoiseFloorDbfs;
        public float GainDb;
        public uint ClippedSamples;
        public uint NonFiniteSamples;
        public uint SilentFrames;

        public bool Has(FrameFlags f) => (Flags & f) != 0;
        /// <summary>Capture time of sample i of this frame (ns, Layer1Native.NowNs clock).</summary>
        public long SampleTimeNs(int i) => CaptureTimeNs + (long)Math.Round(i * 1e9 / SampleRateHz);
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct Stats
    {
        public uint ApiVersion, StructSize;
        public EngineState State;
        public L1Result LastError;
        public uint StreamEpoch, SampleRateHz, DeviceChannels, DeliveredChannels, ActualPeriodFrames,
                    DeviceBufferFrames, RawModeActive, TransportCapacityFrames;
        public ulong PacketsReceived, FramesReceived, FramesDelivered, FramesDroppedOverflow, FramesDroppedDevice,
                     FramesDuplicateDiscarded, DeviceGlitches, TimestampErrors, SilentPackets, Discontinuities, EpochsStarted;
        public uint QueueHighWaterFrames, QueueFramesNow;
        public ulong CallbackOverruns;
        public ulong FramesDroppedUnreported;
        public double CallbackP50Us, CallbackP99Us, CallbackMaxUs;
        public double CaptureToReadyP50Ms, CaptureToReadyP95Ms, CaptureToReadyP99Ms, CaptureToReadyMaxMs;
        public double ClockDriftPpm, TimestampJitterUs;
    }

    [StructLayout(LayoutKind.Sequential)]
    public unsafe struct NativeEvent
    {
        public EventKind Kind;
        public int Value;
        public long Detail;
        public long TimeNs;
        public fixed byte Message[160];
    }

    [StructLayout(LayoutKind.Sequential)]
    public unsafe struct NativeDeviceInfo
    {
        public fixed byte Id[256];
        public fixed byte Name[128];
        public uint IsDefault;
        public uint MixSampleRateHz;
        public uint Channels;
    }

    public static class Layer1Native
    {
        public const string Dll = "fretopia_l1";
        public const uint ApiVersion = 1;

        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] public static extern uint l1_api_version();
        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] public static extern void l1_default_config(ref L1Config cfg);
        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] public static extern long l1_now_ns();
        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] public static extern IntPtr l1_result_string(int result);
        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] public static extern unsafe int l1_list_devices(NativeDeviceInfo* outInfo, uint capacity, out uint count);
        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] public static extern int l1_create(ref L1Config cfg, out IntPtr engine);
        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] public static extern int l1_start(IntPtr engine);
        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] public static extern int l1_stop(IntPtr engine);
        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] public static extern void l1_destroy(IntPtr engine);
        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
        public static extern int l1_read_frame(IntPtr engine, out FrameInfo info, [Out] float[] data, uint dataCapacity,
                                               [Out] float[] raw, uint rawCapacity, int timeoutMs);
        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] public static extern int l1_get_stats(IntPtr engine, out Stats stats);
        [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] public static extern int l1_poll_event(IntPtr engine, out NativeEvent ev);

        /// <summary>Monotonic time (ns) on the same clock as FrameInfo.CaptureTimeNs.</summary>
        public static long NowNs => l1_now_ns();

        public static string ResultString(int r) => Marshal.PtrToStringAnsi(l1_result_string(r)) ?? r.ToString();

        public static unsafe string Utf8(byte* p, int max)
        {
            int n = 0;
            while (n < max && p[n] != 0) n++;
            return System.Text.Encoding.UTF8.GetString(p, n);
        }

        /// <summary>Throws if the managed structs do not match the native library.</summary>
        public static void CheckLayout()
        {
            uint v = l1_api_version();
            if (v != ApiVersion) throw new InvalidOperationException($"fretopia_l1 API {v}, wrapper expects {ApiVersion}");
            Expect<L1Config>(88); Expect<FrameInfo>(128); Expect<Stats>(232); Expect<NativeEvent>(184); Expect<NativeDeviceInfo>(396);
        }
        static void Expect<T>(int size)
        {
            int s = Marshal.SizeOf<T>();
            if (s != size) throw new InvalidOperationException($"{typeof(T).Name} is {s} bytes, native is {size}");
        }
    }
}
