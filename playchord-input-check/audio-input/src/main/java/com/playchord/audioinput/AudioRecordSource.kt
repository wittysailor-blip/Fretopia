package com.playchord.audioinput

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Process

/**
 * Production source: Android AudioRecord, mono PCM16, 44,100 Hz requested (Blueprint 5 §0.1).
 *
 * Sizes: AudioRecord.getMinBufferSize() returns **bytes**. One mono PCM16 frame is 2 bytes, so the
 * read size in frames is `minBytes / 2`. The recorder gets twice the minimum in bytes for headroom.
 */
class AudioRecordSourceFactory(
    private val audioSource: Int = MediaRecorder.AudioSource.DEFAULT,
) : PcmSourceFactory {

    @SuppressLint("MissingPermission") // the caller requests RECORD_AUDIO; a SecurityException is reported as PermissionDenied
    override fun open(request: CaptureRequest): OpenResult {
        val channelMask = if (request.channelCount == 1) AudioFormat.CHANNEL_IN_MONO else AudioFormat.CHANNEL_IN_STEREO
        val encoding = AudioFormat.ENCODING_PCM_16BIT
        val minBytes = AudioRecord.getMinBufferSize(request.sampleRateHz, channelMask, encoding)
        if (minBytes == AudioRecord.ERROR_BAD_VALUE || minBytes == AudioRecord.ERROR || minBytes <= 0) {
            return OpenResult.Failed(
                CaptureError.InitFailed("this phone rejected ${request.sampleRateHz} Hz mono PCM16 (getMinBufferSize = $minBytes)"),
            )
        }
        val bytesPerFrame = BYTES_PER_PCM16_SAMPLE * request.channelCount
        val framesPerRead = minBytes / bytesPerFrame
        val recorderBytes = Math.multiplyExact(minBytes, 2)

        val record = try {
            AudioRecord(audioSource, request.sampleRateHz, channelMask, encoding, recorderBytes)
        } catch (e: SecurityException) {
            return OpenResult.Failed(CaptureError.PermissionDenied)
        } catch (e: IllegalArgumentException) {
            return OpenResult.Failed(CaptureError.InitFailed(e.message ?: "invalid AudioRecord parameters"))
        }
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            return OpenResult.Failed(CaptureError.InitFailed("AudioRecord did not initialise (is another app using the microphone?)"))
        }

        val observed = StreamFormat(
            sampleRateHz = record.sampleRate,
            channelCount = record.channelCount,
            encoding = when (record.audioFormat) {
                AudioFormat.ENCODING_PCM_16BIT -> PcmEncoding.PCM_16BIT
                AudioFormat.ENCODING_PCM_8BIT -> PcmEncoding.PCM_8BIT
                AudioFormat.ENCODING_PCM_FLOAT -> PcmEncoding.PCM_FLOAT
                else -> PcmEncoding.OTHER
            },
        )
        return OpenResult.Opened(AudioRecordSource(record, observed, framesPerRead, minBytes, recorderBytes))
    }

    private companion object {
        const val BYTES_PER_PCM16_SAMPLE = 2
    }
}

internal class AudioRecordSource(
    private val record: AudioRecord,
    override val format: StreamFormat,
    override val framesPerRead: Int,
    override val minBufferBytes: Int,
    override val recorderBufferBytes: Int,
) : PcmSource {

    override fun start() {
        try {
            record.startRecording()
        } catch (e: IllegalStateException) {
            throw CaptureException(CaptureError.StartFailed(e.message ?: "startRecording failed"))
        }
        if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
            throw CaptureException(CaptureError.StartFailed("the recorder is not recording (the microphone may be in use)"))
        }
    }

    override fun read(destination: ShortArray, offset: Int, length: Int): Int =
        record.read(destination, offset, length)

    override fun requestStop() {
        // Releases a blocked read() so the worker can exit before resources are freed.
        try {
            if (record.recordingState == AudioRecord.RECORDSTATE_RECORDING) record.stop()
        } catch (_: IllegalStateException) {
        }
    }

    override fun release() {
        record.release()
    }

    override fun onCaptureThreadStart() {
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
    }

    override fun describeReadError(code: Int): String = when (code) {
        AudioRecord.ERROR_INVALID_OPERATION -> "ERROR_INVALID_OPERATION"
        AudioRecord.ERROR_BAD_VALUE -> "ERROR_BAD_VALUE"
        AudioRecord.ERROR_DEAD_OBJECT -> "ERROR_DEAD_OBJECT"
        AudioRecord.ERROR -> "ERROR"
        else -> "error"
    }
}
