/*
 * Fretopia Layer 1: microphone capture, transport, timing and signal quality.
 *
 * Plain C interface so it can be called from C, C++, C# (Unity P/Invoke) and
 * other languages. All structs are versioned with api_version + struct_size.
 *
 * Threading model
 *   - The engine owns the capture thread (driven by the OS audio device).
 *   - Exactly ONE consumer thread may call l1_read_frame() at a time
 *     (single-producer / single-consumer transport). Do not call it from the
 *     Unity main thread's Update(); use a dedicated reader thread.
 *   - Every other function may be called from any thread.
 *
 * Sample timeline
 *   - first_sample_index counts frames (samples per channel) from the start of
 *     the current stream epoch. Within an epoch it never goes backward, and a
 *     forward jump always comes with L1_FRAME_DISCONTINUITY and a gap record.
 *   - A new epoch (device change, rate change, restart) restarts the index at 0
 *     and sets L1_FRAME_NEW_EPOCH. Reset all downstream state on a new epoch.
 *   - capture_time_ns is the estimated capture time of the FIRST sample in the
 *     frame, on the clock returned by l1_now_ns(). Sample i of a frame is at
 *     capture_time_ns + round(i * 1e9 / sample_rate_hz).
 */
#ifndef FRETOPIA_L1_H
#define FRETOPIA_L1_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#if defined(_WIN32)
#  if defined(L1_BUILDING_DLL)
#    define L1_API __declspec(dllexport)
#  elif defined(L1_STATIC)
#    define L1_API
#  else
#    define L1_API __declspec(dllimport)
#  endif
#else
#  define L1_API __attribute__((visibility("default")))
#endif

#define L1_API_VERSION 1u

/* ---------------------------------------------------------------- results */
typedef enum l1_result {
    L1_OK                    = 0,
    L1_TIMEOUT               = 1,  /* l1_read_frame: no frame within timeout */
    L1_ERR_INVALID_ARG       = -1,
    L1_ERR_NO_DEVICE         = -2, /* no capture device present            */
    L1_ERR_PERMISSION        = -3, /* OS privacy setting denied mic access  */
    L1_ERR_FORMAT            = -4, /* device format cannot be used          */
    L1_ERR_DEVICE_LOST       = -5, /* device unplugged / invalidated        */
    L1_ERR_BACKEND           = -6, /* other OS audio error (see detail)     */
    L1_ERR_STATE             = -7, /* wrong call for current engine state   */
    L1_ERR_BUFFER_TOO_SMALL  = -8,
    L1_ERR_NOT_SUPPORTED     = -9,
    L1_ERR_DEVICE_IN_USE     = -10 /* exclusive use by another application  */
} l1_result;

/* ------------------------------------------------------------ frame flags */
enum {
    L1_FRAME_DISCONTINUITY     = 1u << 0,  /* samples before this frame are missing */
    L1_FRAME_NEW_EPOCH         = 1u << 1,  /* first frame of a new stream epoch     */
    L1_FRAME_TIMESTAMP_ESTIMATED = 1u << 2,/* time extrapolated from an older anchor*/
    L1_FRAME_TIMESTAMP_INVALID = 1u << 3,  /* no usable time; capture_time_ns = 0   */
    L1_FRAME_SILENT            = 1u << 4,  /* device marked (part of) frame silent  */
    L1_FRAME_PARTIAL           = 1u << 5,  /* shorter than nominal: gap or stop next*/
    L1_FRAME_CLIPPED           = 1u << 6,  /* at least one sample at full scale     */
    L1_FRAME_NONFINITE         = 1u << 7,  /* NaN/Inf found and replaced by 0       */
    L1_FRAME_CONDITIONED       = 1u << 8,  /* conditioning changed the data         */
    L1_FRAME_GAP_LENGTH_UNKNOWN= 1u << 9,  /* device reported a glitch, count unknown*/
    L1_FRAME_DUPLICATES_REMOVED= 1u << 10, /* device repeated frames; repeats dropped*/
    L1_FRAME_LAST_OF_EPOCH     = 1u << 11  /* stream stopped/ended after this frame */
};

/* --------------------------------------------------------- gap reasons */
typedef enum l1_gap_reason {
    L1_GAP_NONE                = 0,
    L1_GAP_DEVICE_GLITCH       = 1, /* OS reported data discontinuity              */
    L1_GAP_DEVICE_POSITION_JUMP= 2, /* device position skipped ahead               */
    L1_GAP_TRANSPORT_OVERFLOW  = 3, /* consumer too slow; newest samples dropped   */
    L1_GAP_STREAM_RESTART      = 4, /* new epoch: device change, rate change, etc. */
    L1_GAP_DEVICE_RESET        = 5  /* device position went backward (reset)       */
} l1_gap_reason;

/* --------------------------------------------------- timestamp sources */
typedef enum l1_timestamp_source {
    L1_TS_NONE             = 0,
    L1_TS_DEVICE_QPC       = 1, /* WASAPI packet QPC position (Windows)            */
    L1_TS_SIMULATED        = 2, /* simulated device clock (tests)                 */
    L1_TS_HOST_ARRIVAL     = 3, /* host time at packet arrival (fallback, coarse) */
    L1_TS_FILE             = 4  /* offline file: index / rate                      */
} l1_timestamp_source;

typedef enum l1_channel_mode {
    L1_CHANNELS_ALL     = 0, /* deliver every device channel, interleaved (default) */
    L1_CHANNELS_SELECT  = 1, /* deliver one channel (select_channel)                 */
    L1_CHANNELS_AVERAGE = 2  /* average all channels. Opt-in: can cancel out-of-phase
                                mic-array content (see docs/DECISIONS.md D-CH)       */
} l1_channel_mode;

typedef enum l1_backend_kind {
    L1_BACKEND_DEFAULT   = 0, /* WASAPI on Windows                         */
    L1_BACKEND_WASAPI    = 1,
    L1_BACKEND_SIMULATED = 2  /* deterministic test device (l1_sim_config) */
} l1_backend_kind;

/* ------------------------------------------------------------------ config */
typedef struct l1_config {
    uint32_t api_version;            /* = L1_API_VERSION                          */
    uint32_t struct_size;            /* = sizeof(l1_config)                       */
    l1_backend_kind backend;
    const char* device_id;           /* UTF-8 id from l1_list_devices, NULL = default */
    uint32_t follow_default_device;  /* 1: move to new default mic when it changes */
    uint32_t auto_reconnect;         /* 1: reopen after device loss (new epoch)    */
    uint32_t requested_sample_rate_hz;/* 0 = device mix rate (no resampling)       */
    uint32_t requested_period_frames;/* 0 = device default; actual is reported     */
    uint32_t request_raw_mode;       /* 1: ask OS to bypass voice/effects processing*/
    l1_channel_mode channel_mode;
    uint32_t select_channel;         /* for L1_CHANNELS_SELECT                     */
    uint32_t transport_capacity_frames; /* 0 = 8192 (D04)                          */
    uint32_t frame_size;             /* nominal frames per l1 frame, 0 = 256       */
    /* optional conditioning, all off by default (see docs/DECISIONS.md D08)       */
    uint32_t dc_block;               /* 1: one-pole DC blocker                     */
    float    dc_block_hz;            /* corner, 0 = 5 Hz                           */
    uint32_t hum_notch_hz;           /* 0 off, 50 or 60                            */
    uint32_t hum_notch_harmonics;    /* number of harmonics to notch, 0 = 1        */
    float    digital_gain_db;        /* 0 = unity                                  */
    float    clip_threshold;         /* |x| >= this counts as clipped, 0 = 0.999   */
} l1_config;

/* ---------------------------------------------------------------- frames */
typedef struct l1_frame_info {
    uint32_t api_version;
    uint32_t struct_size;
    uint64_t stream_id;              /* random per engine instance            */
    uint32_t stream_epoch;           /* increments on every (re)start         */
    uint32_t sample_rate_hz;
    uint16_t channels;
    uint16_t channel_mode;           /* l1_channel_mode actually applied      */
    uint32_t sample_format;          /* always 1 = float32 interleaved        */
    int64_t  first_sample_index;
    uint32_t frame_count;            /* samples per channel in this frame. 0 only for
                                        an end-of-epoch frame (LAST_OF_EPOCH) that
                                        reports loss after the last delivered sample */
    uint32_t flags;                  /* L1_FRAME_*                            */
    int64_t  capture_time_ns;        /* first sample, l1_now_ns() clock       */
    int64_t  timestamp_uncertainty_ns;
    uint32_t timestamp_source;       /* l1_timestamp_source                   */
    uint32_t gap_reason;             /* l1_gap_reason for the gap BEFORE frame */
    uint64_t dropped_frames_before;  /* frames lost immediately before frame  */
    uint64_t sequence;               /* frame counter, never resets           */
    int64_t  ready_time_ns;          /* when l1_read_frame produced it        */
    float    rms_dbfs;               /* raw input, all channels                */
    float    peak_dbfs;
    float    noise_floor_dbfs;       /* running estimate (quiet percentile)   */
    float    gain_db;                /* digital gain applied (conditioning)   */
    uint32_t clipped_samples;
    uint32_t nonfinite_samples;
    uint32_t silent_frames;          /* frames that came from silent packets  */
} l1_frame_info;

/* --------------------------------------------------------------- stats */
typedef struct l1_stats {
    uint32_t api_version;
    uint32_t struct_size;
    uint32_t state;                  /* 0 stopped, 1 running, 2 recovering, 3 failed */
    int32_t  last_error;             /* l1_result                              */
    uint32_t stream_epoch;
    uint32_t sample_rate_hz;
    uint32_t device_channels;
    uint32_t delivered_channels;
    uint32_t actual_period_frames;   /* device period reported by OS           */
    uint32_t device_buffer_frames;
    uint32_t raw_mode_active;
    uint32_t transport_capacity_frames;
    uint64_t packets_received;
    uint64_t frames_received;        /* from the device                        */
    uint64_t frames_delivered;       /* to the consumer                         */
    uint64_t frames_dropped_overflow;
    uint64_t frames_dropped_device;  /* position jumps                          */
    uint64_t frames_duplicate_discarded;
    uint64_t device_glitches;        /* OS discontinuity flags                  */
    uint64_t timestamp_errors;
    uint64_t silent_packets;
    uint64_t discontinuities;        /* gap records emitted                     */
    uint64_t epochs_started;
    uint32_t queue_high_water_frames;
    uint32_t queue_frames_now;
    uint64_t callback_overruns;      /* callback took longer than one period    */
    uint64_t frames_dropped_unreported; /* trailing loss that could not be attached to a
                                        frame (consumer stopped reading); normally 0 */
    double   callback_p50_us, callback_p99_us, callback_max_us;
    double   capture_to_ready_p50_ms, capture_to_ready_p95_ms,
             capture_to_ready_p99_ms, capture_to_ready_max_ms;
    double   clock_drift_ppm;        /* device clock vs l1_now_ns()            */
    double   timestamp_jitter_us;    /* RMS residual of packet times vs fit    */
} l1_stats;

/* --------------------------------------------------------------- events */
typedef enum l1_event_kind {
    L1_EVENT_NONE            = 0,
    L1_EVENT_STARTED         = 1, /* value = epoch                          */
    L1_EVENT_STOPPED         = 2,
    L1_EVENT_DEVICE_LOST     = 3,
    L1_EVENT_DEFAULT_CHANGED = 4,
    L1_EVENT_FORMAT_CHANGED  = 5,
    L1_EVENT_ERROR           = 6, /* value = l1_result, detail = OS code      */
    L1_EVENT_RECOVERED       = 7, /* value = new epoch                         */
    L1_EVENT_RAW_UNAVAILABLE = 8, /* RAW mode requested but refused            */
    L1_EVENT_PERIOD_ADJUSTED = 9  /* value = actual period frames              */
} l1_event_kind;

typedef struct l1_event {
    uint32_t kind;          /* l1_event_kind */
    int32_t  value;
    int64_t  detail;        /* e.g. HRESULT */
    int64_t  time_ns;
    char     message[160];  /* UTF-8, human readable */
} l1_event;

/* -------------------------------------------------------------- devices */
typedef struct l1_device_info {
    char     id[256];       /* UTF-8 */
    char     name[128];     /* UTF-8 */
    uint32_t is_default;
    uint32_t mix_sample_rate_hz;
    uint32_t channels;
} l1_device_info;

/* ------------------------------------------------- simulated test device */
typedef struct l1_sim_config {
    uint32_t sample_rate_hz;      /* default 48000 */
    uint32_t channels;            /* default 1     */
    uint32_t min_packet_frames;   /* default 480   */
    uint32_t max_packet_frames;   /* default = min (fixed size) */
    uint32_t realtime;            /* 1: paced by wall clock, 0: as fast as possible */
    double   speed;               /* realtime pacing multiplier, default 1 */
    double   clock_drift_ppm;     /* device clock vs host clock */
    double   timestamp_jitter_us; /* gaussian jitter on reported timestamps */
    uint32_t signal;              /* 0 index counter, 1 sine, 2 silence, 3 file  */
    float    sine_hz, sine_amplitude;
    const float* file_samples;    /* signal 3: interleaved, looped if loop=1 */
    uint64_t file_frames;
    uint32_t loop;
    uint64_t total_frames;        /* stop after this many, 0 = forever */
    uint64_t seed;
    /* fault injection, applied by packet probability */
    double   p_device_glitch;     /* discontinuity flag            */
    double   p_position_jump;     /* skip frames (device lost data)*/
    double   p_duplicate;         /* repeat some frames            */
    double   p_silent;            /* silent flag                   */
    double   p_timestamp_error;   /* timestamp error flag          */
    double   p_callback_delay;    /* sleep inside the callback      */
    uint32_t callback_delay_us;
    int64_t  lose_device_at_frame;/* -1 never: device unplugged    */
    int64_t  change_rate_at_frame;/* -1 never: switch to rate_after*/
    uint32_t rate_after;
    int32_t  open_error;          /* l1_result returned by first open (e.g. permission) */
    uint32_t open_error_count;    /* how many opens fail before success */
} l1_sim_config;

/* ----------------------------------------------------------------- API */
typedef struct l1_engine l1_engine;

L1_API uint32_t    l1_api_version(void);
L1_API void        l1_default_config(l1_config* cfg);
L1_API void        l1_default_sim_config(l1_sim_config* sim);
L1_API int64_t     l1_now_ns(void);   /* monotonic clock used for all times */
L1_API const char* l1_result_string(int32_t result);

L1_API int32_t l1_list_devices(l1_device_info* out, uint32_t capacity, uint32_t* count);

L1_API int32_t l1_create(const l1_config* cfg, l1_engine** out);
L1_API int32_t l1_set_sim_config(l1_engine* e, const l1_sim_config* sim); /* before start */
L1_API int32_t l1_start(l1_engine* e);
L1_API int32_t l1_stop(l1_engine* e);
L1_API void    l1_destroy(l1_engine* e);

/* Consumer: returns L1_OK with one frame, L1_TIMEOUT, or an error.
 * data: interleaved float32, capacity in floats (frame_size * channels is enough).
 * raw:  optional (may be NULL) copy of the unconditioned samples.            */
L1_API int32_t l1_read_frame(l1_engine* e, l1_frame_info* info,
                             float* data, uint32_t data_capacity,
                             float* raw, uint32_t raw_capacity,
                             int32_t timeout_ms);

L1_API int32_t l1_get_stats(l1_engine* e, l1_stats* out);
L1_API int32_t l1_poll_event(l1_engine* e, l1_event* out); /* L1_OK or L1_TIMEOUT if none */

#ifdef __cplusplus
}
#endif
#endif
