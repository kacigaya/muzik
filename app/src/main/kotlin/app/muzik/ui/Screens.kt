package app.muzik.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SearchBar
import androidx.compose.material3.SearchBarDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.adaptive.ExperimentalMaterial3AdaptiveApi
import androidx.compose.material3.adaptive.currentWindowAdaptiveInfo
import androidx.compose.material3.adaptive.layout.calculatePaneScaffoldDirective
import androidx.compose.material3.adaptive.navigation3.ListDetailSceneStrategy
import androidx.compose.material3.adaptive.navigation3.rememberListDetailSceneStrategy
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import app.muzik.R
import app.muzik.data.CollectionKind
import app.muzik.data.DownloadState
import app.muzik.data.MusicCollection
import app.muzik.data.Track
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable data object SearchKey : NavKey
@Serializable data object LibraryKey : NavKey
@Serializable data object LikedKey : NavKey
@Serializable data object DownloadsKey : NavKey
@Serializable data class CollectionKey(val collection: MusicCollection) : NavKey
@Serializable data class PlaylistKey(val id: Long) : NavKey

private val TOP_LEVEL = listOf(SearchKey, LibraryKey)
private val TrackListSaver = Saver<List<Track>?, String>(
    save = { tracks -> tracks?.let { Json.encodeToString(it) } },
    restore = { Json.decodeFromString<List<Track>>(it) },
)

private val GRID = GridCells.Adaptive(360.dp)
private val LIST_PADDING = PaddingValues(bottom = 16.dp)

@OptIn(ExperimentalMaterial3AdaptiveApi::class)
@Composable
fun MuzikRoot(model: MuzikViewModel) {
    val backStack = rememberNavBackStack(SearchKey)
    val player by model.player.collectAsState()
    val playlists by model.playlists.collectAsState()
    var nowPlaying by rememberSaveable { mutableStateOf(false) }
    var addToPlaylist by rememberSaveable(stateSaver = TrackListSaver) { mutableStateOf<List<Track>?>(null) }
    val actions = remember(model) {
        TrackActions(
            onPlayNext = model::playNext,
            onEnqueue = { model.enqueue(listOf(it)) },
            onLike = { model.toggleLike(it) },
            onAddToPlaylist = { addToPlaylist = listOf(it) },
            onDownload = { model.download(listOf(it)) },
            onRemoveDownload = { model.removeDownload(it) },
        )
    }
    val directive = calculatePaneScaffoldDirective(currentWindowAdaptiveInfo())
    val twoPane = directive.maxHorizontalPartitions > 1
    val strategy = rememberListDetailSceneStrategy<NavKey>(directive = directive)
    val openDetail: (NavKey) -> Unit = { key ->
        while (backStack.size > 1 && backStack.last() !in TOP_LEVEL) backStack.removeAt(backStack.lastIndex)
        backStack.add(key)
    }
    val back: (() -> Unit)? = if (twoPane) null else ({ backStack.removeAt(backStack.lastIndex) })
    val placeholder = ListDetailSceneStrategy.listPane(detailPlaceholder = {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Message("Pick something to see it here.") }
    })

    NavigationSuiteScaffold(
        navigationSuiteItems = {
            for ((key, label, icon) in listOf(Triple(SearchKey, "Search", R.drawable.ic_search), Triple(LibraryKey, "Library", R.drawable.ic_library_music))) {
                item(
                    selected = backStack.firstOrNull() == key,
                    onClick = { backStack.clear(); backStack.add(key) },
                    icon = { Icon(painterResource(icon), null) },
                    label = { Text(label) },
                )
            }
        },
    ) {
        Column(Modifier.fillMaxSize()) {
            NavDisplay(
                backStack = backStack,
                onBack = { backStack.removeAt(backStack.lastIndex) },
                sceneStrategies = listOf(strategy),
                modifier = Modifier.weight(1f),
                entryProvider = entryProvider {
                    entry<SearchKey>(metadata = placeholder) { SearchScreen(model, actions) { openDetail(CollectionKey(it)) } }
                    entry<LibraryKey>(metadata = placeholder) { LibraryScreen(model, openDetail) }
                    entry<LikedKey>(metadata = ListDetailSceneStrategy.detailPane()) {
                        val likes by model.likes.collectAsState()
                        TrackListScreen(model, "Liked songs", likes, actions, back, empty = "Songs you like appear here.")
                    }
                    entry<DownloadsKey>(metadata = ListDetailSceneStrategy.detailPane()) {
                        val downloaded by model.downloadedTracks.collectAsState()
                        TrackListScreen(model, "Downloads", downloaded, actions, back, empty = "Downloaded songs play without a connection. They appear here.")
                    }
                    entry<CollectionKey>(metadata = ListDetailSceneStrategy.detailPane()) { key ->
                        CollectionScreen(model, key.collection, actions, back) { addToPlaylist = it }
                    }
                    entry<PlaylistKey>(metadata = ListDetailSceneStrategy.detailPane()) { key ->
                        PlaylistScreen(model, key.id, actions, back) { backStack.remove(key) }
                    }
                },
            )
            player.current?.let { MiniPlayer(player, model) { nowPlaying = true } }
        }
    }

    if (nowPlaying && player.current != null) NowPlayingSheet(model, actions) { nowPlaying = false }
    addToPlaylist?.let { tracks ->
        AddToPlaylistDialog(
            playlists,
            onDismiss = { addToPlaylist = null },
            onPick = { model.addToPlaylist(it, tracks); addToPlaylist = null },
            onCreate = { model.createPlaylist(it, tracks); addToPlaylist = null },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Screen(
    title: String,
    onBack: (() -> Unit)?,
    actions: @Composable () -> Unit = {},
    content: @Composable (Modifier) -> Unit,
) {
    val scroll = TopAppBarDefaults.enterAlwaysScrollBehavior()
    Scaffold(
        modifier = Modifier.nestedScroll(scroll.nestedScrollConnection),
        contentWindowInsets = WindowInsets(0),
        topBar = {
            TopAppBar(
                title = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    if (onBack != null) IconButton(onBack) { Icon(painterResource(R.drawable.ic_arrow_back), "Back") }
                },
                actions = { actions() },
                scrollBehavior = scroll,
            )
        },
    ) { padding -> content(Modifier.fillMaxSize().padding(padding)) }
}

private fun LazyGridScope.full(key: String, content: @Composable () -> Unit) =
    item(key = key, span = { GridItemSpan(maxLineSpan) }) { content() }

private fun LazyGridScope.sectionTitle(text: String) = full("title-$text") {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 8.dp).semantics { heading() },
    )
}

private fun LazyGridScope.tracks(
    model: MuzikViewModel,
    tracks: List<Track>,
    liked: Set<String>,
    downloads: Map<String, DownloadState>,
    currentId: String?,
    actions: TrackActions,
    keyPrefix: String,
    onRemove: ((Track) -> Unit)? = null,
    removeLabel: String = "Remove",
) {
    itemsIndexed(tracks, key = { index, track -> "$keyPrefix-$index-${track.id}" }) { index, track ->
        TrackRow(
            track, track.id in liked, downloads[track.id], track.id == currentId, actions,
            onClick = { model.play(tracks, index) },
            onRemove = onRemove?.let { { it(track) } },
            removeLabel = removeLabel,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SearchScreen(model: MuzikViewModel, actions: TrackActions, open: (MusicCollection) -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    val keyboard = LocalSoftwareKeyboardController.current
    val search by model.search.collectAsState()
    val liked by model.likedIds.collectAsState()
    val downloads by model.downloads.collectAsState()
    val player by model.player.collectAsState()
    Screen("Muzik", null) { modifier ->
        LazyVerticalGrid(GRID, modifier, contentPadding = LIST_PADDING) {
            full("field") {
                SearchBar(
                    inputField = {
                        SearchBarDefaults.InputField(
                            query = query,
                            onQueryChange = { query = it },
                            onSearch = { keyboard?.hide(); model.search(it) },
                            expanded = false,
                            onExpandedChange = {},
                            placeholder = { Text("Songs, albums, playlists") },
                            leadingIcon = { Icon(painterResource(R.drawable.ic_search), null) },
                        )
                    },
                    expanded = false,
                    onExpandedChange = {},
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    windowInsets = WindowInsets(0),
                ) {}
            }
            when (val state = search) {
                Loadable.Idle -> full("idle") { Message("Search YouTube Music. Playback and downloads run on this phone.") }
                Loadable.Loading -> full("loading") { Loading() }
                is Loadable.Failed -> full("failed") { Message(state.message, "Try again") { model.search(query) } }
                is Loadable.Ready -> {
                    val results = state.value
                    if (results.songs.isEmpty() && results.albums.isEmpty() && results.playlists.isEmpty()) {
                        full("empty") { Message("No results. Try other words.") }
                    }
                    for ((label, list) in listOf("Albums" to results.albums, "Playlists" to results.playlists)) {
                        if (list.isEmpty()) continue
                        sectionTitle(label)
                        full("row-$label") {
                            LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                items(list, key = { it.id }) { collection -> CollectionCard(collection) { open(collection) } }
                            }
                        }
                    }
                    if (results.songs.isNotEmpty()) {
                        sectionTitle("Songs")
                        tracks(model, results.songs, liked, downloads, player.current?.id, actions, "song")
                    }
                }
            }
        }
    }
}

@Composable
private fun CollectionCard(collection: MusicCollection, onClick: () -> Unit) {
    Column(
        Modifier.width(144.dp).clip(MaterialTheme.shapes.medium).clickable(role = Role.Button, onClick = onClick).padding(bottom = 8.dp),
    ) {
        Artwork(collection.thumbnail, 144.dp)
        Text(collection.title, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp))
        Text(collection.subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun LibraryScreen(model: MuzikViewModel, open: (NavKey) -> Unit) {
    val likes by model.likes.collectAsState()
    val downloaded by model.downloadedTracks.collectAsState()
    val playlists by model.playlists.collectAsState()
    val follows by model.follows.collectAsState()
    var creating by rememberSaveable { mutableStateOf(false) }
    Screen("Library", null) { modifier ->
        LazyVerticalGrid(GRID, modifier, contentPadding = LIST_PADDING) {
            item(key = "liked") {
                ListItem(
                    headlineContent = { Text("Liked songs") },
                    supportingContent = { Text(count(likes.size, "song")) },
                    leadingContent = { Icon(painterResource(R.drawable.ic_favorite), null, tint = MaterialTheme.colorScheme.primary) },
                    modifier = Modifier.clickable(role = Role.Button) { open(LikedKey) },
                )
            }
            item(key = "downloads") {
                ListItem(
                    headlineContent = { Text("Downloads") },
                    supportingContent = { Text(count(downloaded.size, "song")) },
                    leadingContent = { Icon(painterResource(R.drawable.ic_download_done), null, tint = MaterialTheme.colorScheme.primary) },
                    modifier = Modifier.clickable(role = Role.Button) { open(DownloadsKey) },
                )
            }
            sectionTitle("Playlists")
            items(playlists, key = { "playlist-${it.id}" }) { playlist ->
                ListItem(
                    headlineContent = { Text(playlist.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    supportingContent = { Text(count(playlist.size, "song")) },
                    leadingContent = { Icon(painterResource(R.drawable.ic_queue_music), null) },
                    modifier = Modifier.clickable(role = Role.Button) { open(PlaylistKey(playlist.id)) },
                )
            }
            full("new-playlist") {
                OutlinedButton({ creating = true }, Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                    Icon(painterResource(R.drawable.ic_add), null)
                    Text("New playlist", Modifier.padding(start = 8.dp))
                }
            }
            sectionTitle("Following")
            if (follows.isEmpty()) full("no-follows") { Message("Follow an album or playlist to download its new tracks on its own.") }
            items(follows, key = { "follow-${it.id}" }) { collection ->
                ListItem(
                    headlineContent = { Text(collection.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    supportingContent = { Text(collection.subtitle, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    leadingContent = { Artwork(collection.thumbnail, 48.dp) },
                    modifier = Modifier.clickable(role = Role.Button) { open(CollectionKey(collection)) },
                )
            }
        }
    }
    if (creating) NameDialog("New playlist", confirm = "Create", onDismiss = { creating = false }) {
        model.createPlaylist(it)
        creating = false
    }
}

private fun count(size: Int, noun: String) = if (size == 1) "1 $noun" else "$size ${noun}s"

@Composable
private fun TrackListScreen(model: MuzikViewModel, title: String, tracks: List<Track>, actions: TrackActions, onBack: (() -> Unit)?, empty: String) {
    val liked by model.likedIds.collectAsState()
    val downloads by model.downloads.collectAsState()
    val player by model.player.collectAsState()
    Screen(title, onBack) { modifier ->
        LazyVerticalGrid(GRID, modifier, contentPadding = LIST_PADDING) {
            if (tracks.isEmpty()) full("empty") { Message(empty) } else {
                full("actions") { PlayButtons(onPlay = { model.play(tracks) }, onShuffle = { model.play(tracks.shuffled()) }) }
                tracks(model, tracks, liked, downloads, player.current?.id, actions, "list")
            }
        }
    }
}

@Composable
private fun PlayButtons(onPlay: () -> Unit, onShuffle: () -> Unit, extra: @Composable () -> Unit = {}) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Button(onPlay) {
            Icon(painterResource(R.drawable.ic_play_arrow), null)
            Text("Play", Modifier.padding(start = 8.dp))
        }
        FilledTonalButton(onShuffle) { Text("Shuffle") }
        extra()
    }
}

@Composable
private fun CollectionScreen(
    model: MuzikViewModel,
    collection: MusicCollection,
    actions: TrackActions,
    onBack: (() -> Unit)?,
    onAddAll: (List<Track>) -> Unit,
) {
    LaunchedEffect(collection.id) { model.openCollection(collection) }
    val state by model.collection.collectAsState()
    val follows by model.follows.collectAsState()
    val liked by model.likedIds.collectAsState()
    val downloads by model.downloads.collectAsState()
    val player by model.player.collectAsState()
    val following = follows.any { it.id == collection.id }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    val tracks = (state as? Loadable.Ready)?.value.orEmpty()
    Screen(collection.title, onBack, actions = {
        IconButton({
            if (!following && Build.VERSION.SDK_INT >= 33) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
            model.toggleFollow(collection)
        }) {
            Icon(
                painterResource(if (following) R.drawable.ic_notifications_active else R.drawable.ic_notifications_outline),
                if (following) "Stop following" else "Follow and download new tracks",
                tint = if (following) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }) { modifier ->
        LazyVerticalGrid(GRID, modifier, contentPadding = LIST_PADDING) {
            full("header") {
                Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Artwork(collection.thumbnail, 112.dp)
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(if (collection.kind == CollectionKind.ALBUM) "Album" else "Playlist", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(collection.title, style = MaterialTheme.typography.titleLarge, maxLines = 3, overflow = TextOverflow.Ellipsis)
                        Text(collection.subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
            when (val current = state) {
                Loadable.Idle, Loadable.Loading -> full("loading") { Loading() }
                is Loadable.Failed -> full("failed") { Message(current.message, "Try again") { model.openCollection(collection) } }
                is Loadable.Ready -> {
                    full("actions") {
                        PlayButtons(onPlay = { model.play(tracks) }, onShuffle = { model.play(tracks.shuffled()) }) {
                            IconButton({ model.download(tracks) }) { Icon(painterResource(R.drawable.ic_download), "Download all") }
                            IconButton({ onAddAll(tracks) }) { Icon(painterResource(R.drawable.ic_playlist_add), "Add all to a playlist") }
                        }
                    }
                    if (tracks.isEmpty()) full("empty") { Message("This collection has no playable tracks.") }
                    tracks(model, tracks, liked, downloads, player.current?.id, actions, "collection")
                }
            }
        }
    }
}

@Composable
private fun PlaylistScreen(model: MuzikViewModel, id: Long, actions: TrackActions, onBack: (() -> Unit)?, onDeleted: () -> Unit) {
    val tracks by remember(id) { model.playlistTracks(id) }.collectAsState(emptyList())
    val playlists by model.playlists.collectAsState()
    val liked by model.likedIds.collectAsState()
    val downloads by model.downloads.collectAsState()
    val player by model.player.collectAsState()
    val name = playlists.find { it.id == id }?.name ?: return
    var renaming by rememberSaveable { mutableStateOf(false) }
    var deleting by rememberSaveable { mutableStateOf(false) }
    Screen(name, onBack, actions = {
        IconButton({ renaming = true }) { Icon(painterResource(R.drawable.ic_edit), "Rename playlist") }
        IconButton({ deleting = true }) { Icon(painterResource(R.drawable.ic_delete), "Delete playlist") }
    }) { modifier ->
        LazyVerticalGrid(GRID, modifier, contentPadding = LIST_PADDING) {
            if (tracks.isEmpty()) full("empty") { Message("Add songs from search with the menu on each song.") } else {
                full("actions") {
                    PlayButtons(onPlay = { model.play(tracks) }, onShuffle = { model.play(tracks.shuffled()) }) {
                        IconButton({ model.download(tracks) }) { Icon(painterResource(R.drawable.ic_download), "Download all") }
                    }
                }
                tracks(model, tracks, liked, downloads, player.current?.id, actions, "playlist", onRemove = { model.removeFromPlaylist(id, it) }, removeLabel = "Remove from playlist")
            }
        }
    }
    if (renaming) NameDialog("Rename playlist", name, "Rename", { renaming = false }) {
        model.renamePlaylist(id, it)
        renaming = false
    }
    if (deleting) {
        AlertDialog(
            onDismissRequest = { deleting = false },
            title = { Text("Delete \"$name\"?") },
            text = { Text("The songs stay in your liked songs and downloads.") },
            confirmButton = { TextButton({ deleting = false; model.deletePlaylist(id); onDeleted() }) { Text("Delete") } },
            dismissButton = { TextButton({ deleting = false }) { Text("Cancel") } },
        )
    }
}
