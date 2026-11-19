// Managed owner of one Layer 1 engine: starts capture, runs the single reader
// thread (independent of Unity's frame rate) and hands every frame to Layer 2.
//
//   var cap = new Layer1Capture();
//   cap.FrameReceived += (in FrameInfo f, float[] samples) => layer2.Push(f, samples);  // reader thread
//   cap.Start();
//   ... in Update(): cap.PollEvents(e => Debug.Log(e)); var s = cap.GetStats();
//   cap.Dispose();
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

namespace Fretopia.Audio.Layer1
{
    public readonly struct Layer1Event
    {
        public readonly EventKind Kind;
        public readonly int Value;
        public readonly long Detail;
        public readonly long TimeNs;
        public readonly string Message;
        public Layer1Event(EventKind k, int v, long d, long t, string m) { Kind = k; Value = v; Detail = d; TimeNs = t; Message = m; }
        public override string ToString() => $"{Kind} value={Value} detail=0x{Detail:X} {Message}";
    }

    public readonly struct DeviceInfo
    {
        public readonly string Id, Name;
        public readonly bool IsDefault;
        public readonly int MixSampleRateHz, Channels;
        public DeviceInfo(string id, string name, bool def, int rate, int ch) { Id = id; Name = name; IsDefault = def; MixSampleRateHz = rate; Channels = ch; }
        public override string ToString() => $"{(IsDefault ? "* " : "")}{Name} ({MixSampleRateHz} Hz, {Channels} ch)";
    }

    public sealed class Layer1Exception : Exception
    {
        public readonly L1Result Result;
        public Layer1Exception(string what, int r) : base($"{what}: {Layer1Native.ResultString(r)} ({r})") { Result = (L1Result)r; }
    }

    public sealed class Layer1Capture : IDisposable
    {
        /// <summary>Called on the reader thread for every frame. The samples array is
        /// reused: copy what you need before returning. Interleaved, FrameInfo.Channels wide.</summary>
        public delegate void FrameHandler(in FrameInfo info, float[] samples);
        public event FrameHandler FrameReceived;

        public L1Config Config;
        /// <summary>Device id from ListDevices(); null = system default (follows changes).</summary>
        public string DeviceId;

        IntPtr _engine;
        Thread _reader;
        volatile bool _running;
        float[] _buf;
        long _frames, _lostFrames;

        public Layer1Capture()
        {
            Layer1Native.CheckLayout();
            Config = default;
            Layer1Native.l1_default_config(ref Config);
        }

        public bool IsRunning => _running;
        public long FramesDelivered => Interlocked.Read(ref _frames);
        public long FramesLostReported => Interlocked.Read(ref _lostFrames);

        public static unsafe List<DeviceInfo> ListDevices()
        {
            var list = new List<DeviceInfo>();
            var arr = new NativeDeviceInfo[32];
            fixed (NativeDeviceInfo* p = arr)
            {
                int r = Layer1Native.l1_list_devices(p, (uint)arr.Length, out uint n);
                if (r != 0 && r != (int)L1Result.BufferTooSmall) throw new Layer1Exception("list devices", r);
                for (int i = 0; i < n && i < arr.Length; i++)
                {
                    NativeDeviceInfo* d = p + i;
                    list.Add(new DeviceInfo(Layer1Native.Utf8(d->Id, 256), Layer1Native.Utf8(d->Name, 128),
                                            d->IsDefault != 0, (int)d->MixSampleRateHz, (int)d->Channels));
                }
            }
            return list;
        }

        /// <summary>Creates the engine (once) and starts capture. Throws Layer1Exception
        /// with Result == Permission when Windows blocks microphone access.</summary>
        public void Start()
        {
            if (_running) return;
            if (_engine == IntPtr.Zero)
            {
                IntPtr id = IntPtr.Zero;
                try
                {
                    if (!string.IsNullOrEmpty(DeviceId))
                    {
                        byte[] b = System.Text.Encoding.UTF8.GetBytes(DeviceId + "\0");
                        id = Marshal.AllocHGlobal(b.Length);
                        Marshal.Copy(b, 0, id, b.Length);
                        Config.FollowDefaultDevice = 0;
                    }
                    Config.DeviceId = id;   // copied by l1_create
                    int r = Layer1Native.l1_create(ref Config, out _engine);
                    if (r != 0) throw new Layer1Exception("create", r);
                }
                finally
                {
                    Config.DeviceId = IntPtr.Zero;
                    if (id != IntPtr.Zero) Marshal.FreeHGlobal(id);
                }
            }
            uint frame = Config.FrameSize == 0 ? 256u : Config.FrameSize;
            _buf = new float[frame * 8];
            int rc = Layer1Native.l1_start(_engine);
            if (rc != 0) throw new Layer1Exception("start", rc);
            _running = true;
            _reader = new Thread(ReaderLoop) { Name = "Layer1 reader", IsBackground = true, Priority = ThreadPriority.AboveNormal };
            _reader.Start();
        }

        public void Stop()
        {
            if (_engine == IntPtr.Zero) return;
            _running = false;
            Layer1Native.l1_stop(_engine);   // also releases a reader blocked in l1_read_frame
            _reader?.Join();
            _reader = null;
        }

        void ReaderLoop()
        {
            while (_running)
            {
                int r = Layer1Native.l1_read_frame(_engine, out FrameInfo info, _buf, (uint)_buf.Length, null, 0, 100);
                if (r == (int)L1Result.Ok)
                {
                    Interlocked.Add(ref _frames, info.FrameCount);
                    if (info.DroppedFramesBefore > 0) Interlocked.Add(ref _lostFrames, (long)info.DroppedFramesBefore);
                    try { FrameReceived?.Invoke(in info, _buf); }
                    catch (Exception e) { OnHandlerException?.Invoke(e); }
                }
            }
        }

        /// <summary>Raised (reader thread) if a FrameReceived handler throws.</summary>
        public event Action<Exception> OnHandlerException;

        /// <summary>Delivers queued engine events; call from Update().</summary>
        public unsafe void PollEvents(Action<Layer1Event> handler)
        {
            if (_engine == IntPtr.Zero) return;
            while (Layer1Native.l1_poll_event(_engine, out NativeEvent e) == 0)
                handler(new Layer1Event(e.Kind, e.Value, e.Detail, e.TimeNs, Layer1Native.Utf8(e.Message, 160)));
        }

        public Stats GetStats()
        {
            Stats s = default;
            if (_engine != IntPtr.Zero) Layer1Native.l1_get_stats(_engine, out s);
            return s;
        }

        public void Dispose()
        {
            Stop();
            if (_engine != IntPtr.Zero) { Layer1Native.l1_destroy(_engine); _engine = IntPtr.Zero; }
            GC.SuppressFinalize(this);
        }
        ~Layer1Capture() { if (_engine != IntPtr.Zero) Layer1Native.l1_destroy(_engine); }
    }
}
