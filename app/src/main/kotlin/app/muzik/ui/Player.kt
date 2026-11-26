package app.muzik.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.muzik.R
import app.muzik.data.currentLine

@Composable
fun MiniPlayer(state: PlayerState, model: MuzikViewModel, onOpen: () -> Unit) {
    val track = state.current ?: return
    Surface(color = MaterialTheme.colorScheme.surfaceContainer) {
        Column {
            if (state.durationMs > 0) {
                LinearProgressIndicator(
                    progress = { (state.positionMs.toFloat() / state.durationMs).coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth(),
                    drawStopIndicator = {},
                )
            }
            Row(
                Modifier.fillMaxWidth().clickable(role = Role.Button, onClickLabel = "Open player", onClick = onOpen).padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Artwork(track.thumbnail, 44.dp)
                Column(Modifier.weight(1f)) {
                    Text(track.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        state.error ?: track.artist,
                        style = MaterialTheme.typography.bodySmall,
                        color = if (state.error != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                PlayPause(state, model)
                IconButton(model::next, enabled = state.index < state.queue.lastIndex) {
                    Icon(painterResource(R.drawable.ic_skip_next), "Next track")
                }
            }
        }
    }
}

@Composable
private fun PlayPause(state: PlayerState, model: MuzikViewModel, large: Boolean = false) {
    val label = if (state.playing) "Pause" else "Play"
    val icon = painterResource(if (state.playing) R.drawable.ic_pause else R.drawable.ic_play_arrow)
    if (large) {
        FilledIconButton(model::toggle, Modifier.size(72.dp), colors = IconButtonDefaults.filledIconButtonColors()) {
            Icon(icon, label, Modifier.size(36.dp))
        }
    } else {
        IconButton(model::toggle) { Icon(icon, label) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NowPlayingSheet(model: MuzikViewModel, actions: TrackActions, onDismiss: () -> Unit) {
    val state by model.player.collectAsState()
    val track = state.current ?: return
    var tab by rememberSaveable { mutableIntStateOf(0) }
    ModalBottomSheet(onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        PrimaryTabRow(tab) {
            listOf("Playing", "Lyrics", "Queue").forEachIndexed { index, label ->
                Tab(tab == index, { tab = index }, text = { Text(label) })
            }
        }
        Column(Modifier.fillMaxWidth().fillMaxHeight(0.92f)) {
            when (tab) {
                0 -> Playing(model, state, actions)
                1 -> LyricsView(model, state)
                else -> QueueView(model, state)
            }
        }
    }
    LaunchedEffect(track.id, tab) { if (tab == 1) model.loadLyrics(track) }
}

@Composable
private fun Playing(model: MuzikViewModel, state: PlayerState, actions: TrackActions) {
    val track = state.current ?: return
    val liked by model.likedIds.collectAsState()
    var dragging by remember { mutableStateOf<Float?>(null) }
    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Artwork(track.thumbnail, 280.dp)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(track.title, style = MaterialTheme.typography.titleLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(track.artist, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            val isLiked = track.id in liked
            IconButton({ actions.onLike(track) }) {
                Icon(
                    painterResource(if (isLiked) R.drawable.ic_favorite else R.drawable.ic_favorite_outline),
                    if (isLiked) "Remove from liked songs" else "Add to liked songs",
                    tint = if (isLiked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        val duration = state.durationMs.coerceAtLeast(1)
        val shown = dragging ?: state.positionMs.toFloat()
        Column {
            Slider(
                value = shown.coerceIn(0f, duration.toFloat()),
                onValueChange = { dragging = it },
                onValueChangeFinished = { dragging?.let { model.seek(it.toLong()) }; dragging = null },
                valueRange = 0f..duration.toFloat(),
                enabled = state.durationMs > 0,
                modifier = Modifier.semantics { stateDescription = "${formatTime(shown.toLong())} of ${formatTime(state.durationMs)}" },
            )
            Row {
                Text(formatTime(shown.toLong()), style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
                Text(if (state.durationMs > 0) formatTime(state.durationMs) else "--:--", style = MaterialTheme.typography.labelMedium)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            IconButton(model::previous) { Icon(painterResource(R.drawable.ic_skip_previous), "Previous track") }
            PlayPause(state, model, large = true)
            IconButton(model::next, enabled = state.index < state.queue.lastIndex) { Icon(painterResource(R.drawable.ic_skip_next), "Next track") }
        }
        state.error?.let { error ->
            Text(error, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center)
            TextButton(model::retry) { Text("Retry") }
        }
    }
}

@Composable
private fun LyricsView(model: MuzikViewModel, state: PlayerState) {
    val lyrics by model.lyrics.collectAsState()
    when (val current = lyrics) {
        Loadable.Idle, Loadable.Loading -> Loading()
        is Loadable.Failed -> Message("Could not load lyrics.", "Try again") { state.current?.let(model::loadLyrics) }
        is Loadable.Ready -> {
            val value = current.value ?: return Message("No lyrics found for this song.")
            if (!value.synced) {
                Text(value.text, Modifier.verticalScroll(rememberScrollState()).padding(24.dp), style = MaterialTheme.typography.bodyLarge)
                return
            }
            val active = currentLine(value.lines, state.positionMs)
            val list = rememberLazyListState()
            LaunchedEffect(active) { if (active > 2) list.animateScrollToItem(active - 2) }
            LazyColumn(state = list, modifier = Modifier.padding(horizontal = 24.dp)) {
                itemsIndexed(value.lines) { index, line ->
                    Text(
                        line.text.ifBlank { "♪" },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = if (index == active) FontWeight.Bold else FontWeight.Normal,
                        color = if (index == active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClickLabel = "Play from this line") { model.seek(line.timeMs) }.padding(vertical = 8.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun QueueView(model: MuzikViewModel, state: PlayerState) {
    Column {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("${state.queue.size} in queue", Modifier.weight(1f), style = MaterialTheme.typography.labelLarge)
            TextButton(model::clearQueue) { Text("Clear queue") }
        }
        LazyColumn {
            itemsIndexed(state.queue, key = { index, track -> "$index-${track.id}" }) { index, track ->
                val playing = index == state.index
                ListItem(
                    headlineContent = {
                        Text(track.title, maxLines = 1, overflow = TextOverflow.Ellipsis, color = if (playing) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
                    },
                    supportingContent = { Text(track.artist, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    leadingContent = { Artwork(track.thumbnail, 40.dp) },
                    trailingContent = {
                        if (!playing) IconButton({ model.removeFromQueue(index) }) { Icon(painterResource(R.drawable.ic_close), "Remove ${track.title} from queue") }
                    },
                    modifier = Modifier.clickable(role = Role.Button) { model.select(index) },
                )
            }
        }
    }
}
