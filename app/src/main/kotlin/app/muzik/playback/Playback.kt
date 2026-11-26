package app.muzik.playback

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import androidx.annotation.OptIn
import androidx.core.net.toUri
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import app.muzik.MainActivity
import app.muzik.MuzikApp
import app.muzik.data.AudioSource
import app.muzik.data.Track
import app.muzik.data.VIDEO_ID
import app.muzik.data.YouTube
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import java.io.File
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap

private const val SCHEME = "muzik"

fun Track.toMediaItem(): MediaItem = MediaItem.Builder()
    .setMediaId(id)
    .setUri("$SCHEME://track/$id")
    .setMediaMetadata(
        MediaMetadata.Builder()
            .setTitle(title)
            .setArtist(artist)
            .setAlbumTitle(album)
            .setArtworkUri(thumbnail?.toUri())
            .setDurationMs(if (durationSeconds > 0) durationSeconds * 1000 else null)
            .build(),
    )
    .build()

fun MediaItem.toTrack(): Track = Track(
    id = mediaId,
    title = mediaMetadata.title?.toString().orEmpty(),
    artist = mediaMetadata.artist?.toString().orEmpty(),
    album = mediaMetadata.albumTitle?.toString(),
    thumbnail = mediaMetadata.artworkUri?.toString(),
    durationSeconds = (mediaMetadata.durationMs ?: 0) / 1000,
)

/** Resolves on the device, so YouTube sees the listener's own IP address. */
class AudioResolver(private val downloadFile: (String) -> File) {
    private val sources = ConcurrentHashMap<String, AudioSource>()

    @OptIn(UnstableApi::class)
    fun resolve(spec: DataSpec): DataSpec {
        if (spec.uri.scheme != SCHEME) return spec
        val id = spec.uri.lastPathSegment?.takeIf { VIDEO_ID.matches(it) } ?: throw IllegalArgumentException("Invalid track.")
        val file = downloadFile(id)
        if (file.exists()) return spec.withUri(Uri.fromFile(file))
        val cached = sources[id]?.takeIf { it.expiresAt > System.currentTimeMillis() }
        val source = cached ?: try {
            YouTube.audio(id, m4aOnly = false).also { sources[id] = it }
        } catch (cause: Exception) {
            throw IOException("Could not resolve audio.", cause)
        }
        return spec.withUri(source.url.toUri())
    }

    fun forget() = sources.clear()
}

@OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {
    private var session: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        val app = application as MuzikApp
        val http = DefaultHttpDataSource.Factory()
            .setUserAgent(YouTube.mediaUserAgent)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(30_000)
        val upstream = DefaultDataSource.Factory(this, http)
        val player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(ResolvingDataSource.Factory(upstream, app.resolver::resolve)))
            .setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()
        player.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) = app.resolver.forget()
        })
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        session = MediaSession.Builder(this, player)
            .setSessionActivity(open)
            .setCallback(object : MediaSession.Callback {
                override fun onAddMediaItems(
                    mediaSession: MediaSession,
                    controller: MediaSession.ControllerInfo,
                    mediaItems: MutableList<MediaItem>,
                ): ListenableFuture<MutableList<MediaItem>> = Futures.immediateFuture(
                    mediaItems.filter { VIDEO_ID.matches(it.mediaId) }.map { it.toTrack().toMediaItem() }.toMutableList(),
                )
            })
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo) = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = session?.player
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        session?.run {
            player.release()
            release()
        }
        session = null
        super.onDestroy()
    }
}
