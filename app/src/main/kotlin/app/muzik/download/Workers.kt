package app.muzik.download

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import app.muzik.MuzikApp
import app.muzik.R
import app.muzik.data.DownloadState
import app.muzik.data.VIDEO_ID
import app.muzik.data.YouTube
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException

private const val CHUNK_BYTES = 4L * 1024 * 1024
private const val MAX_BYTES = 300L * 1024 * 1024

class DownloadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as MuzikApp
        val id = inputData.getString("id")?.takeIf { VIDEO_ID.matches(it) } ?: return Result.failure()
        val track = app.dao.track(id) ?: return Result.failure()
        val target = app.downloadFile(id)
        if (!target.exists()) {
            try {
                withContext(Dispatchers.IO) { fetchInChunks(app.http, YouTube.audio(id, m4aOnly = true).url, target) }
            } catch (cause: CancellationException) {
                throw cause
            } catch (_: Exception) {
                if (runAttemptCount < 2) return Result.retry()
                app.dao.setDownloadState(id, DownloadState.FAILED)
                return Result.failure()
            }
        }
        if (app.dao.download(id) == null) {
            target.delete()
            return Result.success()
        }
        app.lyrics.save(track)
        app.dao.setDownloadState(id, DownloadState.DONE)
        return Result.success()
    }
}

// Small ranges keep googlevideo from throttling one long response.
fun fetchInChunks(client: OkHttpClient, url: String, target: File) {
    val partial = File(target.path + ".part")
    partial.delete()
    var position = 0L
    var total = -1L
    partial.outputStream().use { output ->
        while (total < 0 || position < total) {
            val request = Request.Builder().url(url)
                .header("User-Agent", YouTube.mediaUserAgent)
                .header("Range", "bytes=$position-${position + CHUNK_BYTES - 1}")
                .build()
            client.newCall(request).execute().use { response ->
                if (response.code != 206 && !(response.code == 200 && position == 0L)) throw IOException("Media request failed (${response.code}).")
                val written = response.body.byteStream().copyTo(output)
                if (written == 0L) throw IOException("Empty media response.")
                position += written
                total = if (response.code == 200) position else contentRangeTotal(response.header("Content-Range")) ?: throw IOException("Missing Content-Range.")
                if (total > MAX_BYTES) throw IOException("The file is too large.")
            }
        }
    }
    if (!partial.renameTo(target)) throw IOException("Could not save the file.")
}

fun contentRangeTotal(header: String?): Long? = header?.substringAfterLast('/', "")?.toLongOrNull()

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as MuzikApp
        val only = inputData.getString("id")
        val follows = app.dao.followList().filter { only == null || it.id == only }
        var failures = 0
        for (collection in follows) {
            try {
                val tracks = YouTube.tracks(collection)
                val known = tracks.mapNotNull { app.dao.download(it.id) }.map { it.trackId }.toSet()
                val added = tracks.filter { it.id !in known }
                app.queueDownloads(added)
                if (only == null && added.isNotEmpty()) notify(collection.title, added.size)
            } catch (cause: CancellationException) {
                throw cause
            } catch (_: Exception) {
                failures += 1
            }
        }
        return if (follows.isNotEmpty() && failures == follows.size && runAttemptCount < 2) Result.retry() else Result.success()
    }

    private fun notify(title: String, count: Int) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val text = if (count == 1) "1 new track is downloading." else "$count new tracks are downloading."
        val notification = NotificationCompat.Builder(applicationContext, MuzikApp.RELEASES_CHANNEL)
            .setSmallIcon(R.drawable.ic_music_note)
            .setContentTitle(title)
            .setContentText(text)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(applicationContext).notify(title.hashCode(), notification)
    }
}
