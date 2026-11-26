package app.muzik.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.muzik.R
import app.muzik.data.DownloadState
import app.muzik.data.PlaylistSummary
import app.muzik.data.Track
import coil3.compose.AsyncImage

fun formatTime(millis: Long): String {
    val seconds = (millis / 1000).coerceAtLeast(0)
    return "%d:%02d".format(seconds / 60, seconds % 60)
}

@Composable
fun Artwork(url: String?, size: Dp, modifier: Modifier = Modifier) {
    Box(
        modifier.size(size).clip(if (size >= 200.dp) MaterialTheme.shapes.extraLarge else if (size >= 96.dp) MaterialTheme.shapes.medium else MaterialTheme.shapes.small)
            .background(MaterialTheme.colorScheme.surfaceContainerHighest),
        contentAlignment = Alignment.Center,
    ) {
        if (url == null) {
            Icon(painterResource(R.drawable.ic_music_note), null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            AsyncImage(url, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        }
    }
}

@Composable
fun Centered(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { content() }
}

@Composable
fun Message(text: String, action: String? = null, onAction: () -> Unit = {}) {
    Column(Modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        if (action != null) TextButton(onAction) { Text(action) }
    }
}

@Composable
fun Loading() = Centered { CircularProgressIndicator() }

class TrackActions(
    val onPlayNext: (Track) -> Unit,
    val onEnqueue: (Track) -> Unit,
    val onLike: (Track) -> Unit,
    val onAddToPlaylist: (Track) -> Unit,
    val onDownload: (Track) -> Unit,
    val onRemoveDownload: (Track) -> Unit,
)

@Composable
fun TrackRow(
    track: Track,
    liked: Boolean,
    download: DownloadState?,
    playing: Boolean,
    actions: TrackActions,
    onClick: () -> Unit,
    onRemove: (() -> Unit)? = null,
    removeLabel: String = "Remove",
) {
    var menu by rememberSaveable { mutableStateOf(false) }
    val details = buildList {
        add(track.artist)
        if (track.durationSeconds > 0) add(formatTime(track.durationSeconds * 1000))
        when (download) {
            DownloadState.DONE -> add("Downloaded")
            DownloadState.QUEUED -> add("Downloading")
            DownloadState.FAILED -> add("Download failed")
            null -> Unit
        }
    }.joinToString(" · ")
    ListItem(
        headlineContent = {
            Text(
                track.title,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = if (playing) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            )
        },
        supportingContent = { Text(details, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        leadingContent = { Artwork(track.thumbnail, 48.dp) },
        trailingContent = {
            Box {
                IconButton({ menu = true }) { Icon(painterResource(R.drawable.ic_more_vert), "More for ${track.title}") }
                DropdownMenu(menu, { menu = false }) {
                    val entries = buildList<Pair<String, () -> Unit>> {
                        add("Play next" to { actions.onPlayNext(track) })
                        add("Add to queue" to { actions.onEnqueue(track) })
                        add((if (liked) "Remove from liked songs" else "Add to liked songs") to { actions.onLike(track) })
                        add("Add to playlist" to { actions.onAddToPlaylist(track) })
                        if (download == null || download == DownloadState.FAILED) add("Download" to { actions.onDownload(track) })
                        else add("Remove download" to { actions.onRemoveDownload(track) })
                        if (onRemove != null) add(removeLabel to onRemove)
                    }
                    for ((label, action) in entries) {
                        DropdownMenuItem({ Text(label) }, { menu = false; action() })
                    }
                }
            }
        },
        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.clickable(role = Role.Button, onClick = onClick),
    )
}

@Composable
fun NameDialog(title: String, initial: String = "", confirm: String, onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var name by rememberSaveable { mutableStateOf(initial) }
    val valid = name.isNotBlank() && name.trim().length <= 100
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true, isError = name.trim().length > 100)
        },
        confirmButton = { TextButton({ onConfirm(name) }, enabled = valid) { Text(confirm) } },
        dismissButton = { TextButton(onDismiss) { Text("Cancel") } },
    )
}

@Composable
fun AddToPlaylistDialog(
    playlists: List<PlaylistSummary>,
    onDismiss: () -> Unit,
    onPick: (Long) -> Unit,
    onCreate: (String) -> Unit,
) {
    var creating by rememberSaveable { mutableStateOf(playlists.isEmpty()) }
    if (creating) {
        NameDialog("New playlist", confirm = "Create", onDismiss = onDismiss, onConfirm = onCreate)
        return
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add to playlist") },
        text = {
            LazyColumn {
                items(playlists, key = { it.id }) { playlist ->
                    Row(
                        Modifier.fillMaxWidth().clickable(role = Role.Button) { onPick(playlist.id) }.padding(vertical = 16.dp),
                    ) {
                        Text(playlist.name, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${playlist.size}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        },
        confirmButton = { TextButton({ creating = true }) { Text("New playlist") } },
        dismissButton = { TextButton(onDismiss) { Text("Cancel") } },
    )
}
