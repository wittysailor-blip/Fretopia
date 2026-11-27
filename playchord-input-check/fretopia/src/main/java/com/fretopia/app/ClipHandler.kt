package com.fretopia.app

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream

/** Receives a recorded clip from the web app in chunks, then shares it or saves it to Downloads/Fretopia. */
class ClipHandler(private val context: Context) {

    private class Pending(val file: File, val name: String, val mime: String, val out: FileOutputStream)

    private val pending = HashMap<String, Pending>()

    fun begin(id: String, name: String, mime: String) {
        val dir = File(context.cacheDir, "clips").apply { mkdirs() }
        dir.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 86_400_000L }?.forEach { it.delete() }
        val safe = name.replace(Regex("[^A-Za-z0-9._-]"), "-").take(80).ifBlank { "fretopia-take.mp4" }
        val f = File(dir, safe)
        pending[id] = Pending(f, safe, mime, FileOutputStream(f))
    }

    fun chunk(id: String, base64: String) {
        pending[id]?.out?.write(Base64.decode(base64, Base64.DEFAULT))
    }

    fun end(id: String, action: String, done: (ok: Boolean, action: String) -> Unit) {
        val p = pending.remove(id) ?: return done(false, action)
        p.out.close()
        try {
            if (action == "save" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, p.name)
                    put(MediaStore.Downloads.MIME_TYPE, p.mime)
                    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Fretopia")
                }
                val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: return done(false, action)
                context.contentResolver.openOutputStream(uri)?.use { o -> p.file.inputStream().use { it.copyTo(o) } }
                done(true, "save")
            } else {
                // Sharing (and saving on Android 8–9, through the share sheet's "Save" targets).
                val uri = FileProvider.getUriForFile(context, context.packageName + ".files", p.file)
                val send = Intent(Intent.ACTION_SEND).setType(p.mime).putExtra(Intent.EXTRA_STREAM, uri)
                    .putExtra(Intent.EXTRA_TEXT, "Played on Fretopia").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                context.startActivity(Intent.createChooser(send, "Share your take").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                done(true, "share")
            }
        } catch (e: Exception) {
            done(false, action)
        }
    }
}
