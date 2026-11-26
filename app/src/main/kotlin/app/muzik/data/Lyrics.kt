package app.muzik.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

data class LyricLine(val timeMs: Long, val text: String)

data class Lyrics(val text: String) {
    val lines: List<LyricLine> = parseLrc(text)
    val synced: Boolean get() = lines.isNotEmpty()
}

private val LRC_TIME = Regex("""\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?]""")

fun parseLrc(text: String): List<LyricLine> = text.lineSequence().flatMap { line ->
    val stamps = LRC_TIME.findAll(line).toList()
    if (stamps.isEmpty() || stamps.first().range.first != 0) return@flatMap emptySequence()
    val words = line.substring(stamps.last().range.last + 1).trim()
    stamps.asSequence().map { stamp ->
        val (minutes, seconds, fraction) = stamp.destructured
        val millis = fraction.padEnd(3, '0').take(3).ifEmpty { "0" }.toLong()
        LyricLine(minutes.toLong() * 60_000 + seconds.toLong() * 1000 + millis, words)
    }
}.sortedBy { it.timeMs }.toList()

fun currentLine(lines: List<LyricLine>, positionMs: Long): Int =
    lines.indexOfLast { it.timeMs <= positionMs }

class LyricsRepository(private val client: OkHttpClient, private val userAgent: String, private val downloads: File) {
    fun cached(id: String): File = File(downloads, "$id.lrc")

    suspend fun lyrics(track: Track): Lyrics? = withContext(Dispatchers.IO) {
        require(VIDEO_ID.matches(track.id)) { "Invalid video ID." }
        val file = cached(track.id)
        if (file.exists()) return@withContext Lyrics(file.readText())
        lookup(track)?.let(::Lyrics)
    }

    suspend fun save(track: Track) = withContext(Dispatchers.IO) {
        val file = cached(track.id)
        if (file.exists()) return@withContext
        val text = runCatching { lookup(track) }.getOrNull() ?: return@withContext
        file.writeText(if (text.endsWith("\n")) text else "$text\n")
    }

    private fun lookup(track: Track): String? {
        val exact = "https://lrclib.net/api/get".toHttpUrl().newBuilder()
            .addQueryParameter("track_name", track.title)
            .addQueryParameter("artist_name", track.artist)
            .apply { track.album?.let { addQueryParameter("album_name", it) } }
            .addQueryParameter("duration", track.durationSeconds.toString())
            .build()
        get(exact)?.let { body -> pick(JSONObject(body))?.let { return it } }
        val search = "https://lrclib.net/api/search".toHttpUrl().newBuilder()
            .addQueryParameter("track_name", track.title)
            .addQueryParameter("artist_name", track.artist)
            .build()
        val results = get(search)?.let(::JSONArray) ?: return null
        return (0 until results.length()).asSequence().map { results.getJSONObject(it) }
            .filter { track.durationSeconds <= 0 || kotlin.math.abs(it.optDouble("duration", 0.0) - track.durationSeconds) <= 3 }
            .firstNotNullOfOrNull(::pick)
    }

    private fun pick(result: JSONObject): String? =
        result.optString("syncedLyrics").takeIf { it.isNotBlank() && it != "null" }
            ?: result.optString("plainLyrics").takeIf { it.isNotBlank() && it != "null" }

    private fun get(url: okhttp3.HttpUrl): String? {
        val request = okhttp3.Request.Builder().url(url).header("User-Agent", userAgent).header("Accept", "application/json").build()
        client.newCall(request).execute().use { response ->
            return if (response.isSuccessful) response.body.string() else null
        }
    }
}
