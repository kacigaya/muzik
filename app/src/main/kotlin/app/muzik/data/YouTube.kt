package app.muzik.data

import androidx.core.net.toUri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import org.schabi.newpipe.extractor.Image
import org.schabi.newpipe.extractor.MediaFormat
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.Page
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException
import org.schabi.newpipe.extractor.playlist.PlaylistInfo
import org.schabi.newpipe.extractor.playlist.PlaylistInfoItem
import org.schabi.newpipe.extractor.search.SearchInfo
import org.schabi.newpipe.extractor.services.youtube.YoutubeParsingHelper
import org.schabi.newpipe.extractor.services.youtube.linkHandler.YoutubeSearchQueryHandlerFactory
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.AudioTrackType
import org.schabi.newpipe.extractor.stream.DeliveryMethod
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.StreamInfoItem

data class SearchResults(val songs: List<Track>, val albums: List<MusicCollection>, val playlists: List<MusicCollection>)

data class AudioSource(val url: String, val expiresAt: Long)

private const val MAX_COLLECTION_TRACKS = 1000

object YouTube {
    const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0"
    val mediaUserAgent: String get() = YoutubeParsingHelper.getVisionOsUserAgent(null)

    fun init(client: OkHttpClient) = NewPipe.init(OkHttpDownloader(client))

    suspend fun search(query: String): SearchResults = coroutineScope {
        val songs = async { searchItems(query, YoutubeSearchQueryHandlerFactory.MUSIC_SONGS) }
        val albums = async { searchItems(query, YoutubeSearchQueryHandlerFactory.MUSIC_ALBUMS) }
        val playlists = async { searchItems(query, YoutubeSearchQueryHandlerFactory.MUSIC_PLAYLISTS) }
        SearchResults(
            songs.await().filterIsInstance<StreamInfoItem>().mapNotNull { it.toTrack(null) },
            albums.await().filterIsInstance<PlaylistInfoItem>().mapNotNull { it.toCollection(CollectionKind.ALBUM) },
            playlists.await().filterIsInstance<PlaylistInfoItem>().mapNotNull { it.toCollection(CollectionKind.PLAYLIST) },
        )
    }

    suspend fun tracks(collection: MusicCollection): List<Track> = withContext(Dispatchers.IO) {
        require(LIST_ID.matches(collection.id)) { "Invalid collection." }
        val service = ServiceList.YouTube
        val info = PlaylistInfo.getInfo(service, "https://www.youtube.com/playlist?list=${collection.id}")
        val album = if (collection.kind == CollectionKind.ALBUM) collection.title else null
        val items = info.relatedItems.toMutableList()
        var page: Page? = info.nextPage
        while (page != null && items.size < MAX_COLLECTION_TRACKS) {
            val more = PlaylistInfo.getMoreItems(service, info.url, page)
            items += more.items
            page = more.nextPage
        }
        items.take(MAX_COLLECTION_TRACKS).mapNotNull { item ->
            item.toTrack(album)?.let { if (album != null && collection.thumbnail != null) it.copy(thumbnail = collection.thumbnail) else it }
        }.distinctBy { it.id }
    }

    fun audio(id: String, m4aOnly: Boolean): AudioSource {
        require(VIDEO_ID.matches(id)) { "Invalid video ID." }
        val info = StreamInfo.getInfo(ServiceList.YouTube, "https://www.youtube.com/watch?v=$id")
        val stream = bestAudio(info.audioStreams, m4aOnly) ?: error("No playable audio.")
        val expire = stream.content.toUri().getQueryParameter("expire")?.toLongOrNull()
        val expiresAt = minOf(System.currentTimeMillis() + 60 * 60_000, (expire ?: Long.MAX_VALUE / 1000) * 1000 - 60_000)
        return AudioSource(stream.content, expiresAt)
    }

    private suspend fun searchItems(query: String, filter: String) = withContext(Dispatchers.IO) {
        val service = ServiceList.YouTube
        SearchInfo.getInfo(service, service.searchQHFactory.fromQuery(query, listOf(filter), "")).relatedItems
    }
}

fun bestAudio(streams: List<AudioStream>, m4aOnly: Boolean): AudioStream? = streams
    .filter { it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP && it.isUrl }
    .filter { !m4aOnly || it.format == MediaFormat.M4A }
    .filter { it.audioTrackType == null || it.audioTrackType == AudioTrackType.ORIGINAL }
    .maxByOrNull { it.averageBitrate }

private fun bestImage(images: List<Image>): String? =
    images.maxByOrNull { it.width * it.height }?.url?.takeIf { it.startsWith("https://") }

private fun queryParam(url: String, name: String): String? = url.toUri().getQueryParameter(name)

private fun StreamInfoItem.toTrack(album: String?): Track? {
    val id = queryParam(url, "v") ?: return null
    if (!VIDEO_ID.matches(id)) return null
    return Track(id, name, uploaderName.orEmpty().removeSuffix(" - Topic").ifBlank { "Unknown artist" }, album, bestImage(thumbnails), duration.coerceAtLeast(0))
}

private fun PlaylistInfoItem.toCollection(kind: CollectionKind): MusicCollection? {
    val id = queryParam(url, "list") ?: return null
    if (!LIST_ID.matches(id)) return null
    val owner = uploaderName.orEmpty()
    val subtitle = if (streamCount > 0) "$owner · $streamCount tracks" else owner
    return MusicCollection(id, kind, name, subtitle.trim(' ', '·'), bestImage(thumbnails))
}

private class OkHttpDownloader(private val client: OkHttpClient) : Downloader() {
    override fun execute(request: Request): Response {
        val data = request.dataToSend()
        val body = data?.toRequestBody() ?: if (request.httpMethod() == "POST") ByteArray(0).toRequestBody() else null
        val builder = okhttp3.Request.Builder().url(request.url()).method(request.httpMethod(), body)
            .header("User-Agent", YouTube.USER_AGENT)
        for ((name, values) in request.headers()) {
            builder.removeHeader(name)
            values.forEach { builder.addHeader(name, it) }
        }
        client.newCall(builder.build()).execute().use { response ->
            if (response.code == 429) throw ReCaptchaException("YouTube asked for a CAPTCHA.", request.url())
            return Response(response.code, response.message, response.headers.toMultimap(), response.body.string(), response.request.url.toString())
        }
    }
}
