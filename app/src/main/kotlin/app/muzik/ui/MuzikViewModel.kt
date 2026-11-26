package app.muzik.ui

import android.app.Application
import android.content.ComponentName
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import app.muzik.MuzikApp
import app.muzik.data.DownloadState
import app.muzik.data.Lyrics
import app.muzik.data.MusicCollection
import app.muzik.data.Playlist
import app.muzik.data.SearchResults
import app.muzik.data.Track
import app.muzik.data.YouTube
import app.muzik.playback.toMediaItem
import app.muzik.playback.toTrack
import app.muzik.playback.PlaybackService
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.schabi.newpipe.extractor.exceptions.ContentNotAvailableException
import org.schabi.newpipe.extractor.exceptions.SignInConfirmNotBotException

sealed interface Loadable<out T> {
    data object Idle : Loadable<Nothing>
    data object Loading : Loadable<Nothing>
    data class Ready<T>(val value: T) : Loadable<T>
    data class Failed(val message: String) : Loadable<Nothing>
}

data class PlayerState(
    val queue: List<Track> = emptyList(),
    val index: Int = -1,
    val playing: Boolean = false,
    val buffering: Boolean = false,
    val positionMs: Long = 0,
    val durationMs: Long = 0,
    val error: String? = null,
) {
    val current: Track? get() = queue.getOrNull(index)
}

private suspend fun <T> load(block: suspend () -> T): Loadable<T> = try {
    Loadable.Ready(block())
} catch (cause: CancellationException) {
    throw cause
} catch (_: Exception) {
    Loadable.Failed("YouTube did not answer. Check your connection and try again.")
}

fun playbackMessage(error: Throwable): String {
    val causes = generateSequence(error) { it.cause }.toList()
    return when {
        causes.any { it is SignInConfirmNotBotException } ->
            "YouTube blocked this network. Try another network, such as mobile data."
        causes.any { it is ContentNotAvailableException } -> "This track is not available."
        else -> "Could not play this track. Check your connection and try again."
    }
}

class MuzikViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as MuzikApp
    private val dao = app.dao
    private var controller: MediaController? = null

    private val _player = MutableStateFlow(PlayerState())
    val player: StateFlow<PlayerState> = _player.asStateFlow()

    private val _search = MutableStateFlow<Loadable<SearchResults>>(Loadable.Idle)
    val search: StateFlow<Loadable<SearchResults>> = _search.asStateFlow()
    private var searchJob: Job? = null

    private val _collection = MutableStateFlow<Loadable<List<Track>>>(Loadable.Idle)
    val collection: StateFlow<Loadable<List<Track>>> = _collection.asStateFlow()
    private var collectionJob: Job? = null

    private val _lyrics = MutableStateFlow<Loadable<Lyrics?>>(Loadable.Idle)
    val lyrics: StateFlow<Loadable<Lyrics?>> = _lyrics.asStateFlow()
    private var lyricsFor: String? = null

    val likes = dao.likes().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val likedIds = dao.likedIds().map { it.toSet() }.stateIn(viewModelScope, SharingStarted.Eagerly, emptySet())
    val playlists = dao.playlists().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val downloads = dao.downloads().map { rows -> rows.associate { it.trackId to it.state } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyMap<String, DownloadState>())
    val downloadedTracks = dao.downloadedTracks().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val follows = dao.follows().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    fun playlistTracks(id: Long) = dao.playlistTracks(id)

    init {
        viewModelScope.launch {
            val token = SessionToken(app, ComponentName(app, PlaybackService::class.java))
            val connected = MediaController.Builder(app, token).buildAsync().await()
            controller = connected
            connected.addListener(object : Player.Listener {
                override fun onEvents(player: Player, events: Player.Events) = sync()
                override fun onPlayerError(error: PlaybackException) {
                    _player.value = _player.value.copy(error = playbackMessage(error))
                }
            })
            sync()
            while (isActive) {
                delay(500)
                if (connected.isPlaying) _player.value = _player.value.copy(positionMs = connected.currentPosition)
            }
        }
    }

    override fun onCleared() {
        controller?.release()
    }

    private fun sync() {
        val player = controller ?: return
        val queue = (0 until player.mediaItemCount).map { player.getMediaItemAt(it).toTrack() }
        _player.value = PlayerState(
            queue = queue,
            index = if (queue.isEmpty()) -1 else player.currentMediaItemIndex,
            playing = player.isPlaying,
            buffering = player.playbackState == Player.STATE_BUFFERING,
            positionMs = player.currentPosition,
            durationMs = player.duration.takeIf { it > 0 } ?: 0,
            error = if (player.playerError == null) null else _player.value.error,
        )
    }

    fun search(query: String) {
        val text = query.trim()
        if (text.isEmpty()) return
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            _search.value = Loadable.Loading
            _search.value = load { YouTube.search(text) }
        }
    }

    fun openCollection(collection: MusicCollection) {
        collectionJob?.cancel()
        collectionJob = viewModelScope.launch {
            _collection.value = Loadable.Loading
            _collection.value = load { YouTube.tracks(collection) }
        }
    }

    fun loadLyrics(track: Track) {
        if (lyricsFor == track.id && _lyrics.value !is Loadable.Failed) return
        lyricsFor = track.id
        viewModelScope.launch {
            _lyrics.value = Loadable.Loading
            val result = load { app.lyrics.lyrics(track) }
            if (lyricsFor == track.id) _lyrics.value = result
        }
    }

    fun play(tracks: List<Track>, index: Int = 0) {
        val player = controller ?: return
        if (tracks.isEmpty()) return
        player.setMediaItems(tracks.map { it.toMediaItem() }, index.coerceIn(tracks.indices), 0)
        player.prepare()
        player.play()
    }

    fun playNext(track: Track) {
        val player = controller ?: return
        if (player.mediaItemCount == 0) return play(listOf(track))
        player.addMediaItem(player.currentMediaItemIndex + 1, track.toMediaItem())
    }

    fun enqueue(tracks: List<Track>) {
        val player = controller ?: return
        if (player.mediaItemCount == 0) return play(tracks)
        player.addMediaItems(tracks.map { it.toMediaItem() })
    }

    fun toggle() {
        val player = controller ?: return
        if (player.isPlaying) player.pause() else {
            if (player.playerError != null || player.playbackState == Player.STATE_IDLE) player.prepare()
            player.play()
        }
    }

    fun retry() {
        val player = controller ?: return
        _player.value = _player.value.copy(error = null)
        player.prepare()
        player.play()
    }

    fun next() = controller?.seekToNextMediaItem()
    fun previous() = controller?.seekToPrevious()
    fun seek(positionMs: Long) = controller?.seekTo(positionMs)
    fun select(index: Int) = controller?.run { seekTo(index, 0); prepare(); play() }
    fun removeFromQueue(index: Int) = controller?.removeMediaItem(index)
    fun clearQueue() = controller?.run { stop(); clearMediaItems() }

    fun toggleLike(track: Track) = viewModelScope.launch {
        if (track.id in likedIds.value) dao.unlike(track.id) else dao.like(track)
    }

    fun createPlaylist(name: String, tracks: List<Track> = emptyList()) = viewModelScope.launch {
        val id = dao.createPlaylist(Playlist(name = name.trim().take(100)))
        if (tracks.isNotEmpty()) dao.addToPlaylist(id, tracks)
    }

    fun renamePlaylist(id: Long, name: String) = viewModelScope.launch { dao.renamePlaylist(id, name.trim().take(100)) }
    fun deletePlaylist(id: Long) = viewModelScope.launch { dao.deletePlaylist(id) }
    fun addToPlaylist(id: Long, tracks: List<Track>) = viewModelScope.launch { dao.addToPlaylist(id, tracks) }
    fun removeFromPlaylist(id: Long, track: Track) = viewModelScope.launch { dao.removeFromPlaylist(id, track.id) }

    fun download(tracks: List<Track>) = viewModelScope.launch { app.queueDownloads(tracks) }
    fun removeDownload(track: Track) = viewModelScope.launch { app.removeDownload(track.id) }

    fun toggleFollow(collection: MusicCollection) = viewModelScope.launch {
        if (follows.value.any { it.id == collection.id }) dao.unfollow(collection.id) else app.follow(collection)
    }
}
