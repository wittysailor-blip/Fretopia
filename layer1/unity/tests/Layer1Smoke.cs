// Smoke test of the Unity bridge outside Unity (Mono/.NET): checks struct layout
// against the native library and runs the simulated device through the real
// reader thread, verifying every sample.
using System;
using System.Threading;
using Fretopia.Audio.Layer1;

static class Layer1Smoke
{
    static float Counter(long index, int ch)
    {
        uint m = (uint)((ulong)(index + (long)ch * 333331) & 0xFFFFFu);
        return m * (1.0f / 2097152.0f);
    }

    static int Main()
    {
        int fails = 0;
        Layer1Native.CheckLayout();
        Console.WriteLine("layout OK, api " + Layer1Native.l1_api_version());
        using (var cap = new Layer1Capture())
        {
            cap.Config.Backend = BackendKind.Simulated;
            cap.Config.RequestRawMode = 0;
            long next = -1, mismatches = 0, frames = 0, gaps = 0; uint epoch = 0;
            cap.FrameReceived += (in FrameInfo f, float[] s) =>
            {
                if (f.Has(FrameFlags.NewEpoch)) { epoch = f.StreamEpoch; next = f.FirstSampleIndex; }
                if (f.FirstSampleIndex != next) gaps++;
                for (int i = 0; i < f.FrameCount; i++) if (s[i] != Counter(f.FirstSampleIndex + i, 0)) mismatches++;
                next = f.FirstSampleIndex + f.FrameCount;
                frames += f.FrameCount;
            };
            cap.Start();
            Thread.Sleep(2000);
            var st = cap.GetStats();
            cap.PollEvents(e => Console.WriteLine("event: " + e));
            cap.Stop();
            var end = cap.GetStats();
            if ((ulong)frames != end.FramesDelivered || end.FramesDelivered != end.FramesReceived) { Console.WriteLine($"undelivered: received {end.FramesReceived} delivered {end.FramesDelivered} seen {frames}"); fails++; }
            Console.WriteLine($"frames {frames}, mismatches {mismatches}, gaps {gaps}, epoch {epoch}, state {st.State}, rate {st.SampleRateHz}, p99 cb {st.CallbackP99Us:F0} us");
            if (frames < 90000 || mismatches != 0 || gaps != 0 || epoch != 1 || st.SampleRateHz != 48000) fails++;
        }
        try { Layer1Capture.ListDevices(); }
        catch (Layer1Exception e) { Console.WriteLine("ListDevices on this OS: " + e.Result); if (e.Result != L1Result.NotSupported) fails++; }
        Console.WriteLine(fails == 0 ? "PASS" : "FAIL");
        return fails;
    }
}
