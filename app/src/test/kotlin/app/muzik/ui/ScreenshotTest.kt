package app.muzik.ui

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LocalRippleConfiguration
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import app.muzik.MuzikApp
import app.muzik.MuzikTheme
import app.muzik.data.CollectionKind
import app.muzik.data.Download
import app.muzik.data.DownloadState
import app.muzik.data.Lyrics
import app.muzik.data.MusicCollection
import app.muzik.data.Playlist
import app.muzik.data.SearchResults
import app.muzik.data.Track
import com.github.takahirom.roborazzi.ExperimentalRoborazziApi
import com.github.takahirom.roborazzi.RoborazziOptions
import com.github.takahirom.roborazzi.captureRoboImage
import com.github.takahirom.roborazzi.captureScreenRoboImage
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

private val tracks = listOf(
    Track("aaaaaaaaaa1", "Morning Light", "The Harbor Lights", "Harbor Nights", null, 215),
    Track("aaaaaaaaaa2", "Slow Tide", "The Harbor Lights", "Harbor Nights", null, 187),
    Track("aaaaaaaaaa3", "Paper Boats", "Mira Vale", null, null, 242),
    Track("aaaaaaaaaa4", "Lanterns", "Mira Vale", null, null, 199),
)
private val album = MusicCollection("OLAK5uy_album0001", CollectionKind.ALBUM, "Harbor Nights", "The Harbor Lights · 2 tracks", null)
private val playlist = MusicCollection("PLplaylist000001", CollectionKind.PLAYLIST, "Quiet Evenings", "Muzik · 4 tracks", null)
private val results = SearchResults(tracks, listOf(album), listOf(playlist))
private val sampleLyrics = Lyrics("[00:00.00]First light on the water\n[00:30.00]Boats leave the harbor\n[01:00.00]We sing the slow tide home\n[01:30.00]Lanterns on the shore\n")

@OptIn(ExperimentalMaterial3Api::class)
abstract class ScreenshotCase {
    @get:Rule val compose = createComposeRule()
    private val app get() = ApplicationProvider.getApplicationContext<MuzikApp>()
    protected lateinit var model: MuzikViewModel
    private var dark by mutableStateOf(false)

    @Before
    fun setUp() {
        model = MuzikViewModel(app).apply {
            searchMusic = { results }
            collectionTracks = { tracks.take(2) }
            findLyrics = { sampleLyrics }
        }
    }

    protected fun show() = compose.setContent {
        MuzikTheme(dark = dark, dynamic = false) {
            // Press ripples fade on the platform clock, which would make captures flaky.
            CompositionLocalProvider(LocalRippleConfiguration provides null) { MuzikRoot(model) }
        }
    }

    protected fun search() {
        model.search("harbor")
        compose.waitUntil(5_000) { model.search.value is Loadable.Ready }
    }

    protected fun openAlbum() {
        compose.onNodeWithText("Harbor Nights").performClick()
        compose.waitForIdle()
        compose.waitUntil(5_000) { model.collection.value is Loadable.Ready }
    }

    @OptIn(ExperimentalRoborazziApi::class)
    protected fun capture(name: String, wholeScreen: Boolean = false) {
        val options = RoborazziOptions(compareOptions = RoborazziOptions.CompareOptions(outputDirectoryPath = "build/outputs/roborazzi"))
        for (theme in listOf("light", "dark")) {
            dark = theme == "dark"
            compose.waitForIdle()
            assertNamedActions()
            val path = "src/test/screenshots/${name}_$theme.png"
            if (wholeScreen) captureScreenRoboImage(path, options) else compose.onRoot().captureRoboImage(path, roborazziOptions = options)
        }
    }

    private fun assertNamedActions() {
        val unnamed = compose.onAllNodes(hasClickAction()).fetchSemanticsNodes().filter { node ->
            node.config.getOrNull(SemanticsProperties.ContentDescription).isNullOrEmpty() &&
                node.config.getOrNull(SemanticsProperties.Text).isNullOrEmpty() &&
                node.config.getOrNull(SemanticsProperties.EditableText) == null
        }
        assertTrue("Clickable nodes without a name: ${unnamed.map { it.config }}", unnamed.isEmpty())
    }
}

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "en-rUS-w411dp-h891dp-xxhdpi")
class ScreenshotTest : ScreenshotCase() {
    @Test
    fun searchIdle() {
        show()
        capture("search_idle")
    }

    @Test
    fun searchResults() {
        show()
        search()
        capture("search_results")
    }

    @Test
    fun albumPage() {
        show()
        search()
        openAlbum()
        capture("album")
    }

    @Test
    fun library() {
        val dao = ApplicationProvider.getApplicationContext<MuzikApp>().dao
        runBlocking {
            tracks.take(3).forEach { dao.like(it) }
            val id = dao.createPlaylist(Playlist(name = "Road trip"))
            dao.addToPlaylist(id, tracks)
            dao.setDownload(Download(tracks[0].id, DownloadState.DONE, 0))
            dao.follow(album)
        }
        show()
        compose.onNodeWithText("Library").performClick()
        compose.waitUntil(5_000) { model.follows.value.isNotEmpty() && model.playlists.value.isNotEmpty() && model.downloadedTracks.value.isNotEmpty() }
        capture("library")
    }

    @Test
    fun nowPlaying() {
        model.showPlayer(PlayerState(queue = tracks, index = 0, playing = true, positionMs = 62_000, durationMs = 215_000))
        show()
        compose.onNodeWithText("Morning Light").performClick()
        capture("now_playing", wholeScreen = true)
    }

    @Test
    fun lyrics() {
        model.showPlayer(PlayerState(queue = tracks, index = 0, playing = true, positionMs = 62_000, durationMs = 215_000))
        show()
        compose.onNodeWithText("Morning Light").performClick()
        compose.onNodeWithText("Lyrics").performClick()
        compose.waitForIdle()
        compose.waitUntil(5_000) { model.lyrics.value is Loadable.Ready }
        capture("lyrics", wholeScreen = true)
    }
}

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "en-rUS-w1280dp-h800dp-xhdpi")
class LargeScreenshotTest : ScreenshotCase() {
    @Test
    fun albumListDetail() {
        show()
        search()
        openAlbum()
        capture("album_large")
    }
}
