package app.muzik

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.room.Room
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import app.muzik.data.Download
import app.muzik.data.DownloadState
import app.muzik.data.LyricsRepository
import app.muzik.data.MusicCollection
import app.muzik.data.MuzikDatabase
import app.muzik.data.Track
import app.muzik.data.VIDEO_ID
import app.muzik.data.YouTube
import app.muzik.download.DownloadWorker
import app.muzik.download.SyncWorker
import app.muzik.playback.AudioResolver
import okhttp3.OkHttpClient
import java.io.File
import java.util.concurrent.TimeUnit

class MuzikApp : Application() {
    lateinit var database: MuzikDatabase
        private set
    lateinit var http: OkHttpClient
        private set
    lateinit var lyrics: LyricsRepository
        private set
    lateinit var resolver: AudioResolver
        private set
    val dao get() = database.music()
    val downloadsDir: File get() = File(filesDir, "downloads").apply { mkdirs() }

    override fun onCreate() {
        super.onCreate()
        http = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .followSslRedirects(false)
            .build()
        YouTube.init(http)
        database = Room.databaseBuilder(this, MuzikDatabase::class.java, "muzik.db").build()
        lyrics = LyricsRepository(http, "Muzik/${BuildConfig.VERSION_NAME} ( https://github.com/kacigaya/muzik )", downloadsDir)
        resolver = AudioResolver(::downloadFile)
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(RELEASES_CHANNEL, "New tracks", NotificationManager.IMPORTANCE_DEFAULT),
        )
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "follows",
            ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<SyncWorker>(12, TimeUnit.HOURS).setConstraints(network).build(),
        )
    }

    fun downloadFile(id: String): File {
        require(VIDEO_ID.matches(id)) { "Invalid video ID." }
        return File(downloadsDir, "$id.m4a")
    }

    suspend fun queueDownloads(tracks: List<Track>) {
        dao.upsertTracks(tracks)
        val existing = tracks.mapNotNull { dao.download(it.id) }.filter { it.state != DownloadState.FAILED }.map { it.trackId }.toSet()
        val work = WorkManager.getInstance(this)
        for (track in tracks.filter { it.id !in existing }) {
            dao.setDownload(Download(track.id, DownloadState.QUEUED, System.currentTimeMillis()))
            work.enqueueUniqueWork(
                "download-${track.id}",
                ExistingWorkPolicy.REPLACE,
                OneTimeWorkRequestBuilder<DownloadWorker>().setConstraints(network).setInputData(workDataOf("id" to track.id)).build(),
            )
        }
    }

    suspend fun removeDownload(id: String) {
        WorkManager.getInstance(this).cancelUniqueWork("download-$id")
        dao.removeDownload(id)
        downloadFile(id).delete()
        lyrics.cached(id).delete()
    }

    suspend fun follow(collection: MusicCollection) {
        dao.follow(collection)
        WorkManager.getInstance(this).enqueueUniqueWork(
            "follow-${collection.id}",
            ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(network).setInputData(workDataOf("id" to collection.id)).build(),
        )
    }

    companion object {
        const val RELEASES_CHANNEL = "releases"
        private val network = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
    }
}
