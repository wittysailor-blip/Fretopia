// Example MonoBehaviour: owns Layer1Capture for a scene, forwards frames to a
// Layer 2 consumer on the reader thread, surfaces events and levels on the
// main thread. Drop on a GameObject; assign a component implementing
// ILayer2FrameConsumer (or leave empty to only meter the input).
#if UNITY_5_3_OR_NEWER
using System;
using UnityEngine;

namespace Fretopia.Audio.Layer1
{
    /// <summary>Layer 2 entry point. Called on the Layer 1 reader thread, never
    /// on the Unity main thread. Must return quickly (well under one frame,
    /// 5.3 ms at 256 frames / 48 kHz) or the transport fills and reports loss.</summary>
    public interface ILayer2FrameConsumer
    {
        /// <summary>A new epoch (NewEpoch flag) means: reset all analysis state.</summary>
        void OnFrame(in FrameInfo info, float[] interleaved);
    }

    public sealed class Layer1MicSource : MonoBehaviour
    {
        [Tooltip("Component implementing ILayer2FrameConsumer (optional)")]
        public MonoBehaviour layer2;
        [Tooltip("Ask Windows for RAW capture (no voice processing)")]
        public bool requestRawMode = true;
        public int frameSize = 256;
        public int transportCapacityFrames = 8192;
        public bool logEvents = true;

        public float LevelDbfs { get; private set; } = -120f;
        public float PeakDbfs { get; private set; } = -120f;
        public float NoiseFloorDbfs { get; private set; } = -120f;
        public bool Clipping { get; private set; }
        public string Status { get; private set; } = "stopped";

        Layer1Capture _cap;
        ILayer2FrameConsumer _consumer;
        // Written on the reader thread, read on the main thread (atomic 32-bit floats).
        volatile float _rms = -120f, _peak = -120f, _floor = -120f;
        volatile bool _clip;

        void OnEnable()
        {
            _consumer = layer2 as ILayer2FrameConsumer;
            try
            {
                _cap = new Layer1Capture();
                _cap.Config.RequestRawMode = requestRawMode ? 1u : 0u;
                _cap.Config.FrameSize = (uint)frameSize;
                _cap.Config.TransportCapacityFrames = (uint)transportCapacityFrames;
                _cap.FrameReceived += OnFrame;
                _cap.OnHandlerException += e => Debug.LogException(e);
                _cap.Start();
                Status = "running";
            }
            catch (Layer1Exception e) when (e.Result == L1Result.Permission)
            {
                Status = "Microphone blocked: Windows Settings > Privacy & security > Microphone";
                Debug.LogWarning(Status);
            }
            catch (Exception e)
            {
                Status = "error: " + e.Message;
                Debug.LogException(e);
            }
        }

        void OnFrame(in FrameInfo f, float[] samples)
        {
            _rms = f.RmsDbfs; _peak = f.PeakDbfs; _floor = f.NoiseFloorDbfs;
            if (f.ClippedSamples > 0) _clip = true;
            _consumer?.OnFrame(in f, samples);
        }

        void Update()
        {
            if (_cap == null) return;
            LevelDbfs = _rms; PeakDbfs = _peak; NoiseFloorDbfs = _floor; Clipping = _clip; _clip = false;
            _cap.PollEvents(e =>
            {
                if (logEvents) Debug.Log("[Layer1] " + e);
                switch (e.Kind)
                {
                    case EventKind.DeviceLost: Status = "microphone disconnected"; break;
                    case EventKind.Recovered: Status = "running"; break;
                    case EventKind.Error: Status = "error: " + e.Message; break;
                }
            });
        }

        void OnDisable() { _cap?.Dispose(); _cap = null; Status = "stopped"; }
        void OnApplicationQuit() { OnDisable(); }
    }
}
#endif
