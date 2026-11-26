package app.muzik

import app.muzik.data.LyricLine
import app.muzik.data.bestAudio
import app.muzik.data.currentLine
import app.muzik.data.parseLrc
import app.muzik.download.contentRangeTotal
import app.muzik.ui.playbackMessage
import java.io.IOException
import org.schabi.newpipe.extractor.exceptions.SignInConfirmNotBotException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.schabi.newpipe.extractor.MediaFormat
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.AudioTrackType
import org.schabi.newpipe.extractor.stream.DeliveryMethod

class MuzikTest {
    @Test
    fun parsesSyncedLyricsWithRepeatedStamps() {
        val lines = parseLrc("[ar: Artist]\n[00:12.5]Hello\n[01:02.034][00:03]Chorus\nplain line\n[00:20.10]")
        assertEquals(
            listOf(LyricLine(3000, "Chorus"), LyricLine(12500, "Hello"), LyricLine(20100, ""), LyricLine(62034, "Chorus")),
            lines,
        )
    }

    @Test
    fun plainLyricsHaveNoSyncedLines() {
        assertEquals(emptyList<LyricLine>(), parseLrc("Just words\nMore words"))
    }

    @Test
    fun findsTheLineForAPosition() {
        val lines = listOf(LyricLine(1000, "a"), LyricLine(5000, "b"))
        assertEquals(-1, currentLine(lines, 500))
        assertEquals(0, currentLine(lines, 4999))
        assertEquals(1, currentLine(lines, 5000))
    }

    @Test
    fun readsTheTotalFromContentRange() {
        assertEquals(3_456_789L, contentRangeTotal("bytes 0-4194303/3456789"))
        assertNull(contentRangeTotal("bytes 0-10/*"))
        assertNull(contentRangeTotal(null))
    }

    private fun stream(id: String, format: MediaFormat, bitrate: Int, type: AudioTrackType? = null, delivery: DeliveryMethod = DeliveryMethod.PROGRESSIVE_HTTP) =
        AudioStream.Builder().setId(id).setContent("https://example.googlevideo.com/$id", true)
            .setMediaFormat(format).setDeliveryMethod(delivery).setAverageBitrate(bitrate)
            .apply { type?.let(::setAudioTrackType) }.build()

    @Test
    fun picksTheBestOriginalProgressiveAudio() {
        val streams = listOf(
            stream("m4a", MediaFormat.M4A, 128),
            stream("opus", MediaFormat.WEBMA_OPUS, 160),
            stream("dubbed", MediaFormat.WEBMA_OPUS, 256, AudioTrackType.DUBBED),
            stream("dash", MediaFormat.M4A, 512, delivery = DeliveryMethod.DASH),
        )
        assertEquals("opus", bestAudio(streams, m4aOnly = false)?.id)
        assertEquals("m4a", bestAudio(streams, m4aOnly = true)?.id)
        assertNull(bestAudio(streams.drop(1).filter { it.format != MediaFormat.M4A }, m4aOnly = true))
    }

    @Test
    fun explainsABlockedNetwork() {
        val blocked = IOException("wrapped", SignInConfirmNotBotException("bot"))
        assertEquals("YouTube blocked this network. Try another network, such as mobile data.", playbackMessage(RuntimeException(blocked)))
        assertEquals("Could not play this track. Check your connection and try again.", playbackMessage(IOException("offline")))
    }
}
