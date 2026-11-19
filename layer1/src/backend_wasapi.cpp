// Windows WASAPI capture backend: event-driven shared mode.
//
// Public API pattern only (Microsoft Core Audio documentation):
//   - IMMDeviceEnumerator -> IMMDevice -> IAudioClient3 (fallback IAudioClient2 / IAudioClient)
//   - optional RAW stream option through IAudioClient2::SetClientProperties
//   - IAudioClient3::InitializeSharedAudioStream for a negotiated low-latency
//     period, else IAudioClient::Initialize with AUDCLNT_STREAMFLAGS_EVENTCALLBACK
//   - capture thread registered with MMCSS ("Pro Audio"), waits on the event,
//     drains IAudioCaptureClient::GetBuffer packets with their device position,
//     QPC position (100 ns units) and flags
//   - IMMNotificationClient for device removal and default-device changes
#if defined(_WIN32)

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <initguid.h>
#include <windows.h>
#include <audioclient.h>
#include <avrt.h>
#include <functiondiscoverykeys_devpkey.h>
#include <ksmedia.h>
#include <mmdeviceapi.h>
#include <mmreg.h>

#include <algorithm>
#include <atomic>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "backend.h"

#ifndef AUDCLNT_E_DEVICE_INVALIDATED
#define AUDCLNT_E_DEVICE_INVALIDATED AUDCLNT_ERR(0x004)
#endif
#ifndef AUDCLNT_E_DEVICE_IN_USE
#define AUDCLNT_E_DEVICE_IN_USE AUDCLNT_ERR(0x00a)
#endif
#ifndef AUDCLNT_E_UNSUPPORTED_FORMAT
#define AUDCLNT_E_UNSUPPORTED_FORMAT AUDCLNT_ERR(0x008)
#endif
#ifndef AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM
#define AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM 0x80000000
#endif
#ifndef AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY
#define AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY 0x08000000
#endif

namespace l1 {

namespace {

template <class T> void release(T*& p) { if (p) { p->Release(); p = nullptr; } }

std::string utf8(const wchar_t* w) {
    if (!w) return {};
    int n = WideCharToMultiByte(CP_UTF8, 0, w, -1, nullptr, 0, nullptr, nullptr);
    std::string s(n > 0 ? n - 1 : 0, '\0');
    if (n > 1) WideCharToMultiByte(CP_UTF8, 0, w, -1, &s[0], n, nullptr, nullptr);
    return s;
}
std::wstring wide(const std::string& s) {
    int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, nullptr, 0);
    std::wstring w(n > 0 ? n - 1 : 0, L'\0');
    if (n > 1) MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, &w[0], n);
    return w;
}

int32_t map_hr(HRESULT hr) {
    switch (hr) {
    case E_ACCESSDENIED: return L1_ERR_PERMISSION;
    case E_NOTFOUND: return L1_ERR_NO_DEVICE;   // == HRESULT_FROM_WIN32(ERROR_NOT_FOUND)
    case AUDCLNT_E_DEVICE_INVALIDATED: return L1_ERR_DEVICE_LOST;
    case AUDCLNT_E_DEVICE_IN_USE: return L1_ERR_DEVICE_IN_USE;
    case AUDCLNT_E_UNSUPPORTED_FORMAT: return L1_ERR_FORMAT;
    default: return L1_ERR_BACKEND;
    }
}

// KSDATAFORMAT subtypes (public values from ksmedia.h), defined here so the
// build does not depend on ksuser.lib providing the symbols.
const GUID kSubtypePcm = {0x00000001, 0x0000, 0x0010, {0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71}};
const GUID kSubtypeFloat = {0x00000003, 0x0000, 0x0010, {0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71}};

// Sample formats the converter understands.
enum class Fmt { F32, I16, I24, I32, I24in32 };

struct ComScope {
    HRESULT hr;
    ComScope() { hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED); }
    ~ComScope() { if (SUCCEEDED(hr)) CoUninitialize(); }
};

class NotificationClient final : public IMMNotificationClient {
public:
    std::atomic<ULONG> refs{1};
    std::mutex mu;
    std::wstring device_id;          // device being captured
    bool follow_default = false;
    BackendListener* listener = nullptr;

    ULONG STDMETHODCALLTYPE AddRef() override { return ++refs; }
    ULONG STDMETHODCALLTYPE Release() override { ULONG r = --refs; if (!r) delete this; return r; }
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (riid == __uuidof(IUnknown) || riid == __uuidof(IMMNotificationClient)) {
            *ppv = static_cast<IMMNotificationClient*>(this); AddRef(); return S_OK;
        }
        *ppv = nullptr; return E_NOINTERFACE;
    }
    HRESULT STDMETHODCALLTYPE OnDeviceStateChanged(LPCWSTR id, DWORD state) override {
        std::lock_guard<std::mutex> g(mu);
        if (listener && id && device_id == id && state != DEVICE_STATE_ACTIVE)
            listener->backend_event(BackendEvent::DeviceLost, L1_ERR_DEVICE_LOST, (int64_t)state, "capture device is no longer active");
        return S_OK;
    }
    HRESULT STDMETHODCALLTYPE OnDeviceAdded(LPCWSTR) override { return S_OK; }
    HRESULT STDMETHODCALLTYPE OnDeviceRemoved(LPCWSTR id) override {
        std::lock_guard<std::mutex> g(mu);
        if (listener && id && device_id == id)
            listener->backend_event(BackendEvent::DeviceLost, L1_ERR_DEVICE_LOST, 0, "capture device removed");
        return S_OK;
    }
    HRESULT STDMETHODCALLTYPE OnDefaultDeviceChanged(EDataFlow flow, ERole role, LPCWSTR id) override {
        std::lock_guard<std::mutex> g(mu);
        if (listener && follow_default && flow == eCapture && role == eConsole && (!id || device_id != id))
            listener->backend_event(BackendEvent::DefaultChanged, 0, 0, "default capture device changed");
        return S_OK;
    }
    HRESULT STDMETHODCALLTYPE OnPropertyValueChanged(LPCWSTR, const PROPERTYKEY) override { return S_OK; }
};

class WasapiBackend final : public Backend {
public:
    WasapiBackend() = default;
    ~WasapiBackend() override { stop(); close(); }

    int32_t open(const OpenRequest& req, OpenResult& res, BackendListener* listener) override {
        close();
        listener_ = listener;
        // open/close always run on the engine's control thread (MTA, see engine.cpp).
        static thread_local ComScope com_for_thread;
        (void)com_for_thread;
        HRESULT hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                                      __uuidof(IMMDeviceEnumerator), (void**)&enumr_);
        if (FAILED(hr)) return fail("CoCreateInstance(MMDeviceEnumerator)", hr);

        if (req.device_id.empty()) hr = enumr_->GetDefaultAudioEndpoint(eCapture, eConsole, &dev_);
        else hr = enumr_->GetDevice(wide(req.device_id).c_str(), &dev_);
        if (FAILED(hr) || !dev_) return fail("get capture endpoint", hr == S_OK ? E_NOTFOUND : hr);

        LPWSTR wid = nullptr;
        dev_->GetId(&wid);
        dev_id_w_ = wid ? wid : L"";
        res.device_id = utf8(wid);
        CoTaskMemFree(wid);
        res.device_name = friendly_name(dev_);

        // Prefer IAudioClient3; fall back to older interfaces.
        hr = dev_->Activate(__uuidof(IAudioClient3), CLSCTX_ALL, nullptr, (void**)&client3_);
        if (SUCCEEDED(hr)) { client_ = client3_; client_->AddRef(); }
        else hr = dev_->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, (void**)&client_);
        if (FAILED(hr)) return fail("IMMDevice::Activate(IAudioClient)", hr);

        // RAW mode (bypasses voice-oriented processing where the driver supports it).
        res.raw_active = false;
        if (req.raw) {
            IAudioClient2* c2 = nullptr;
            if (SUCCEEDED(client_->QueryInterface(__uuidof(IAudioClient2), (void**)&c2))) {
                AudioClientProperties props{};
                props.cbSize = sizeof(props);
                props.bIsOffload = FALSE;
                props.eCategory = AudioCategory_Other;
                props.Options = AUDCLNT_STREAMOPTIONS_RAW;
                HRESULT h2 = c2->SetClientProperties(&props);
                res.raw_active = SUCCEEDED(h2);
                raw_hr_ = h2;
                release(c2);
            }
        }

        WAVEFORMATEX* mix = nullptr;
        hr = client_->GetMixFormat(&mix);
        if (FAILED(hr) || !mix) return fail("GetMixFormat", hr);
        // The stream format is the mix format, optionally at a requested rate
        // (Windows resamples with AUTOCONVERTPCM; only when explicitly asked).
        std::vector<uint8_t> fmtbuf(sizeof(WAVEFORMATEX) + mix->cbSize);
        std::memcpy(fmtbuf.data(), mix, fmtbuf.size());
        CoTaskMemFree(mix);
        WAVEFORMATEX* wf = (WAVEFORMATEX*)fmtbuf.data();
        DWORD extra = 0;
        if (req.sample_rate && req.sample_rate != wf->nSamplesPerSec) {
            wf->nSamplesPerSec = req.sample_rate;
            wf->nAvgBytesPerSec = req.sample_rate * wf->nBlockAlign;
            extra = AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
        }
        if (!parse_format(wf)) {
            char m[96];
            std::snprintf(m, sizeof m, "unsupported capture format tag %u, %u bits", wf->wFormatTag, wf->wBitsPerSample);
            note(m);
            return L1_ERR_FORMAT;
        }
        rate_ = wf->nSamplesPerSec;
        channels_ = wf->nChannels;

        event_ = CreateEventW(nullptr, FALSE, FALSE, nullptr);
        stop_event_ = CreateEventW(nullptr, TRUE, FALSE, nullptr);
        if (!event_ || !stop_event_) return fail("CreateEvent", HRESULT_FROM_WIN32(GetLastError()));

        // Period negotiation.
        UINT32 period = 0;
        bool initialized = false;
        if (client3_ && extra == 0) {
            UINT32 def = 0, fund = 0, mn = 0, mx = 0;
            if (SUCCEEDED(client3_->GetSharedModeEnginePeriod(wf, &def, &fund, &mn, &mx)) && fund) {
                UINT32 want = req.period_frames ? req.period_frames : def;
                want = std::clamp(want, mn, mx);
                want = std::max(mn, (want + fund / 2) / fund * fund);
                hr = client3_->InitializeSharedAudioStream(AUDCLNT_STREAMFLAGS_EVENTCALLBACK, want, wf, nullptr);
                if (SUCCEEDED(hr)) { initialized = true; period = want; }
                else init_hr_ = hr;
            }
        }
        if (!initialized) {
            REFERENCE_TIME dur = 0;   // let Windows choose; event-driven
            if (req.period_frames) dur = (REFERENCE_TIME)((double)req.period_frames * 1e7 / rate_);
            hr = client_->Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_EVENTCALLBACK | extra,
                                     dur, 0, wf, nullptr);
            if (FAILED(hr)) return fail("IAudioClient::Initialize", hr);
            REFERENCE_TIME defp = 0, minp = 0;
            client_->GetDevicePeriod(&defp, &minp);
            period = (UINT32)((double)defp * rate_ / 1e7 + 0.5);
        }
        if (client3_) {
            WAVEFORMATEX* cur = nullptr;
            UINT32 cp = 0;
            if (SUCCEEDED(client3_->GetCurrentSharedModeEnginePeriod(&cur, &cp)) && cp) period = cp;
            if (cur) CoTaskMemFree(cur);
        }
        hr = client_->SetEventHandle(event_);
        if (FAILED(hr)) return fail("SetEventHandle", hr);
        UINT32 bufsz = 0;
        client_->GetBufferSize(&bufsz);
        hr = client_->GetService(__uuidof(IAudioCaptureClient), (void**)&capture_);
        if (FAILED(hr)) return fail("GetService(IAudioCaptureClient)", hr);

        // Scratch for format conversion: a packet never exceeds the buffer size.
        max_packet_ = std::max<UINT32>(bufsz, period) + 64;
        conv_.assign((size_t)max_packet_ * channels_, 0.0f);

        // Device notifications.
        notifier_ = new NotificationClient();
        notifier_->device_id = dev_id_w_;
        notifier_->follow_default = req.device_id.empty();
        notifier_->listener = listener;
        enumr_->RegisterEndpointNotificationCallback(notifier_);

        res.sample_rate = rate_;
        res.channels = channels_;
        res.period_frames = period;
        res.buffer_frames = bufsz;
        res.max_packet_frames = max_packet_;
        res.ts_source = L1_TS_DEVICE_QPC;
        char fn[160];
        std::snprintf(fn, sizeof fn, "%s %uch %u Hz%s%s", fmt_name(), channels_, rate_,
                      extra ? " (Windows resampling)" : "", initialized ? " IAudioClient3" : " IAudioClient");
        res.format_note = fn;
        period_frames_ = period;
        return L1_OK;
    }

    int32_t start(CaptureSink* sink) override {
        if (!client_ || !capture_) return L1_ERR_STATE;
        sink_ = sink;
        ResetEvent(stop_event_);
        th_ = std::thread([this] { run(); });
        return L1_OK;
    }

    void stop() override {
        if (stop_event_) SetEvent(stop_event_);
        if (th_.joinable()) th_.join();
    }

    void close() override {
        if (notifier_) {
            { std::lock_guard<std::mutex> g(notifier_->mu); notifier_->listener = nullptr; }
            if (enumr_) enumr_->UnregisterEndpointNotificationCallback(notifier_);
            notifier_->Release();
            notifier_ = nullptr;
        }
        release(capture_);
        release(client3_);
        release(client_);
        release(dev_);
        release(enumr_);
        if (event_) { CloseHandle(event_); event_ = nullptr; }
        if (stop_event_) { CloseHandle(stop_event_); stop_event_ = nullptr; }
    }

    int32_t list_devices(std::vector<l1_device_info>& out) override {
        ComScope com;
        IMMDeviceEnumerator* en = nullptr;
        HRESULT hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                                      __uuidof(IMMDeviceEnumerator), (void**)&en);
        if (FAILED(hr)) return map_hr(hr);
        std::wstring def_id;
        IMMDevice* def = nullptr;
        if (SUCCEEDED(en->GetDefaultAudioEndpoint(eCapture, eConsole, &def))) {
            LPWSTR w = nullptr; def->GetId(&w); if (w) { def_id = w; CoTaskMemFree(w); }
            release(def);
        }
        IMMDeviceCollection* col = nullptr;
        hr = en->EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE, &col);
        if (FAILED(hr)) { release(en); return map_hr(hr); }
        UINT n = 0; col->GetCount(&n);
        for (UINT i = 0; i < n; ++i) {
            IMMDevice* d = nullptr;
            if (FAILED(col->Item(i, &d))) continue;
            l1_device_info info{};
            LPWSTR w = nullptr; d->GetId(&w);
            std::string id = utf8(w);
            info.is_default = (w && def_id == w) ? 1 : 0;
            if (w) CoTaskMemFree(w);
            std::snprintf(info.id, sizeof info.id, "%s", id.c_str());
            std::snprintf(info.name, sizeof info.name, "%s", friendly_name(d).c_str());
            IAudioClient* c = nullptr;
            if (SUCCEEDED(d->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, (void**)&c))) {
                WAVEFORMATEX* m = nullptr;
                if (SUCCEEDED(c->GetMixFormat(&m)) && m) {
                    info.mix_sample_rate_hz = m->nSamplesPerSec;
                    info.channels = m->nChannels;
                    CoTaskMemFree(m);
                }
                release(c);
            }
            out.push_back(info);
            release(d);
        }
        release(col);
        release(en);
        return L1_OK;
    }

private:
    static std::string friendly_name(IMMDevice* d) {
        IPropertyStore* ps = nullptr;
        std::string name;
        if (SUCCEEDED(d->OpenPropertyStore(STGM_READ, &ps))) {
            PROPVARIANT v; PropVariantInit(&v);
            if (SUCCEEDED(ps->GetValue(PKEY_Device_FriendlyName, &v)) && v.vt == VT_LPWSTR) name = utf8(v.pwszVal);
            PropVariantClear(&v);
            release(ps);
        }
        return name;
    }

    bool parse_format(const WAVEFORMATEX* wf) {
        WORD tag = wf->wFormatTag;
        WORD valid = wf->wBitsPerSample;
        if (tag == WAVE_FORMAT_EXTENSIBLE && wf->cbSize >= 22) {
            const WAVEFORMATEXTENSIBLE* x = (const WAVEFORMATEXTENSIBLE*)wf;
            valid = x->Samples.wValidBitsPerSample ? x->Samples.wValidBitsPerSample : wf->wBitsPerSample;
            if (IsEqualGUID(x->SubFormat, kSubtypeFloat)) tag = WAVE_FORMAT_IEEE_FLOAT;
            else if (IsEqualGUID(x->SubFormat, kSubtypePcm)) tag = WAVE_FORMAT_PCM;
            else return false;
        }
        block_ = wf->nBlockAlign;
        if (tag == WAVE_FORMAT_IEEE_FLOAT && wf->wBitsPerSample == 32) { fmt_ = Fmt::F32; return true; }
        if (tag == WAVE_FORMAT_PCM) {
            if (wf->wBitsPerSample == 16) { fmt_ = Fmt::I16; return true; }
            if (wf->wBitsPerSample == 24) { fmt_ = Fmt::I24; return true; }
            if (wf->wBitsPerSample == 32) { fmt_ = valid == 24 ? Fmt::I24in32 : Fmt::I32; return true; }
        }
        return false;
    }
    const char* fmt_name() const {
        switch (fmt_) {
        case Fmt::F32: return "float32";
        case Fmt::I16: return "pcm16";
        case Fmt::I24: return "pcm24";
        case Fmt::I32: return "pcm32";
        default: return "pcm24in32";
        }
    }
    // Converts one packet to float32 in conv_. Real-time safe (no allocation).
    const float* convert(const BYTE* data, UINT32 frames) {
        const size_t n = (size_t)frames * channels_;
        float* o = conv_.data();
        switch (fmt_) {
        case Fmt::F32: return (const float*)data;   // already float; no copy
        case Fmt::I16: { const int16_t* s = (const int16_t*)data; for (size_t i = 0; i < n; ++i) o[i] = s[i] * (1.0f / 32768.0f); break; }
        case Fmt::I24: for (size_t i = 0; i < n; ++i) {
                int32_t v = (int32_t)((uint32_t)data[3 * i] << 8 | (uint32_t)data[3 * i + 1] << 16 | (uint32_t)data[3 * i + 2] << 24);
                o[i] = (float)(v >> 8) * (1.0f / 8388608.0f);
            } break;
        case Fmt::I32:
        case Fmt::I24in32: { const int32_t* s = (const int32_t*)data; for (size_t i = 0; i < n; ++i) o[i] = (float)((double)s[i] * (1.0 / 2147483648.0)); break; }
        }
        return o;
    }

    void run() {
        ComScope com;
        DWORD task_index = 0;
        HANDLE mmcss = AvSetMmThreadCharacteristicsW(L"Pro Audio", &task_index);
        if (!mmcss) mmcss = AvSetMmThreadCharacteristicsW(L"Audio", &task_index);
        set_rt_thread(true);

        BackendEvent ev = BackendEvent::Error;
        int32_t code = 0;
        HRESULT bad = S_OK;
        bool posted = false;
        HRESULT hr = client_->Start();
        if (FAILED(hr)) { bad = hr; code = map_hr(hr); ev = code == L1_ERR_DEVICE_LOST ? BackendEvent::DeviceLost : BackendEvent::Error; posted = true; }
        const HANDLE waits[2] = {stop_event_, event_};
        // Packets normally arrive every period; 2 s of silence from the device is a stall.
        int stalls = 0;
        while (!posted) {
            DWORD w = WaitForMultipleObjects(2, waits, FALSE, 2000);
            if (w == WAIT_OBJECT_0) break;  // stop requested
            if (w == WAIT_TIMEOUT) {
                if (++stalls >= 2) { ev = BackendEvent::Stalled; code = L1_ERR_BACKEND; posted = true; }
                continue;
            }
            if (w != WAIT_OBJECT_0 + 1) { bad = HRESULT_FROM_WIN32(GetLastError()); code = L1_ERR_BACKEND; posted = true; break; }
            stalls = 0;
            const int64_t t0 = now_ns();
            for (;;) {
                UINT32 next = 0;
                hr = capture_->GetNextPacketSize(&next);
                if (FAILED(hr)) break;
                if (next == 0) break;
                BYTE* data = nullptr;
                UINT32 frames = 0;
                DWORD flags = 0;
                UINT64 devpos = 0, qpc = 0;
                hr = capture_->GetBuffer(&data, &frames, &flags, &devpos, &qpc);
                if (hr == AUDCLNT_S_BUFFER_EMPTY) break;
                if (FAILED(hr)) break;
                DevicePacket p;
                p.frames = frames;
                p.device_position = devpos;
                p.position_valid = true;
                // QPC position is in 100 ns units on the QueryPerformanceCounter timebase.
                p.time_ns = (int64_t)qpc * 100;
                p.time_valid = !(flags & AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR) && qpc != 0;
                p.device_glitch = (flags & AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY) != 0;
                p.silent = (flags & AUDCLNT_BUFFERFLAGS_SILENT) != 0;
                // When the silent flag is set the buffer must be treated as silence.
                if (!p.silent && frames <= max_packet_) p.data = convert(data, frames);
                else if (!p.silent) p.silent = true;   // impossible size: never read past scratch
                sink_->on_packet(p);
                capture_->ReleaseBuffer(frames);
            }
            sink_->note_callback(now_ns() - t0);
            if (FAILED(hr)) {
                bad = hr;
                code = map_hr(hr);
                ev = code == L1_ERR_DEVICE_LOST ? BackendEvent::DeviceLost : BackendEvent::Error;
                posted = true;
            }
        }
        client_->Stop();
        set_rt_thread(false);
        if (mmcss) AvRevertMmThreadCharacteristics(mmcss);
        if (posted && listener_) {
            char m[128];
            std::snprintf(m, sizeof m, "capture stopped: HRESULT 0x%08lX", (unsigned long)bad);
            listener_->backend_event(ev, code, (int64_t)(uint32_t)bad, m);
        }
    }

    int32_t fail(const char* what, HRESULT hr) {
        char m[160];
        std::snprintf(m, sizeof m, "%s failed: HRESULT 0x%08lX", what, (unsigned long)hr);
        note(m);
        last_hr_ = hr;
        return map_hr(hr);
    }
    void note(const char* m) { std::snprintf(last_msg_, sizeof last_msg_, "%s", m); }

    BackendListener* listener_ = nullptr;
    CaptureSink* sink_ = nullptr;
    IMMDeviceEnumerator* enumr_ = nullptr;
    IMMDevice* dev_ = nullptr;
    IAudioClient* client_ = nullptr;
    IAudioClient3* client3_ = nullptr;
    IAudioCaptureClient* capture_ = nullptr;
    NotificationClient* notifier_ = nullptr;
    HANDLE event_ = nullptr, stop_event_ = nullptr;
    std::thread th_;
    std::wstring dev_id_w_;
    std::vector<float> conv_;
    Fmt fmt_ = Fmt::F32;
    UINT32 rate_ = 0, channels_ = 0, block_ = 0, max_packet_ = 0, period_frames_ = 0;
    HRESULT last_hr_ = S_OK, raw_hr_ = S_OK, init_hr_ = S_OK;
    char last_msg_[160] = {};
};

} // namespace

std::unique_ptr<Backend> make_wasapi_backend() { return std::unique_ptr<Backend>(new WasapiBackend()); }

} // namespace l1

#else
#include "backend.h"
namespace l1 {
std::unique_ptr<Backend> make_wasapi_backend() { return nullptr; }
}
#endif
