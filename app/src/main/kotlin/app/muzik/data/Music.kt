package app.muzik.data

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.Serializable

val VIDEO_ID = Regex("^[A-Za-z0-9_-]{11}$")
val LIST_ID = Regex("^[A-Za-z0-9_-]{10,200}$")

@Serializable
@Entity(tableName = "tracks")
data class Track(
    @PrimaryKey val id: String,
    val title: String,
    val artist: String,
    val album: String?,
    val thumbnail: String?,
    val durationSeconds: Long,
)

@Serializable
enum class CollectionKind { ALBUM, PLAYLIST }

@Serializable
@Entity(tableName = "follows")
data class MusicCollection(
    @PrimaryKey val id: String,
    val kind: CollectionKind,
    val title: String,
    val subtitle: String,
    val thumbnail: String?,
)

@Entity(
    tableName = "likes",
    foreignKeys = [ForeignKey(Track::class, ["id"], ["trackId"], onDelete = ForeignKey.CASCADE)],
)
data class Like(@PrimaryKey val trackId: String, val likedAt: Long)

@Entity(tableName = "playlists")
data class Playlist(@PrimaryKey(autoGenerate = true) val id: Long = 0, val name: String)

data class PlaylistSummary(val id: Long, val name: String, val size: Int)

@Entity(
    tableName = "playlist_tracks",
    primaryKeys = ["playlistId", "trackId"],
    foreignKeys = [
        ForeignKey(Playlist::class, ["id"], ["playlistId"], onDelete = ForeignKey.CASCADE),
        ForeignKey(Track::class, ["id"], ["trackId"], onDelete = ForeignKey.CASCADE),
    ],
    indices = [Index("trackId")],
)
data class PlaylistTrack(val playlistId: Long, val trackId: String, val position: Int)

enum class DownloadState { QUEUED, DONE, FAILED }

@Entity(
    tableName = "downloads",
    foreignKeys = [ForeignKey(Track::class, ["id"], ["trackId"], onDelete = ForeignKey.CASCADE)],
)
data class Download(@PrimaryKey val trackId: String, val state: DownloadState, val createdAt: Long)

@Dao
interface MusicDao {
    @Upsert
    suspend fun upsertTracks(tracks: List<Track>)

    @Query("SELECT * FROM tracks WHERE id = :id")
    suspend fun track(id: String): Track?

    @Query("SELECT tracks.* FROM tracks JOIN likes ON likes.trackId = tracks.id ORDER BY likes.likedAt DESC")
    fun likes(): Flow<List<Track>>

    @Query("SELECT trackId FROM likes")
    fun likedIds(): Flow<List<String>>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertLike(like: Like)

    @Transaction
    suspend fun like(track: Track) {
        upsertTracks(listOf(track))
        insertLike(Like(track.id, System.currentTimeMillis()))
    }

    @Query("DELETE FROM likes WHERE trackId = :id")
    suspend fun unlike(id: String)

    @Query(
        "SELECT playlists.id, playlists.name, COUNT(playlist_tracks.trackId) AS size FROM playlists " +
            "LEFT JOIN playlist_tracks ON playlist_tracks.playlistId = playlists.id " +
            "GROUP BY playlists.id ORDER BY playlists.name COLLATE NOCASE",
    )
    fun playlists(): Flow<List<PlaylistSummary>>

    @Insert
    suspend fun createPlaylist(playlist: Playlist): Long

    @Query("UPDATE playlists SET name = :name WHERE id = :id")
    suspend fun renamePlaylist(id: Long, name: String)

    @Query("DELETE FROM playlists WHERE id = :id")
    suspend fun deletePlaylist(id: Long)

    @Query(
        "SELECT tracks.* FROM tracks JOIN playlist_tracks ON playlist_tracks.trackId = tracks.id " +
            "WHERE playlist_tracks.playlistId = :id ORDER BY playlist_tracks.position",
    )
    fun playlistTracks(id: Long): Flow<List<Track>>

    @Query("SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_tracks WHERE playlistId = :id")
    suspend fun nextPosition(id: Long): Int

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertPlaylistTracks(rows: List<PlaylistTrack>)

    @Transaction
    suspend fun addToPlaylist(id: Long, tracks: List<Track>) {
        upsertTracks(tracks)
        val start = nextPosition(id)
        insertPlaylistTracks(tracks.mapIndexed { index, track -> PlaylistTrack(id, track.id, start + index) })
    }

    @Query("DELETE FROM playlist_tracks WHERE playlistId = :playlistId AND trackId = :trackId")
    suspend fun removeFromPlaylist(playlistId: Long, trackId: String)

    @Query("SELECT * FROM downloads")
    fun downloads(): Flow<List<Download>>

    @Query(
        "SELECT tracks.* FROM tracks JOIN downloads ON downloads.trackId = tracks.id " +
            "WHERE downloads.state = 'DONE' ORDER BY downloads.createdAt DESC",
    )
    fun downloadedTracks(): Flow<List<Track>>

    @Query("SELECT * FROM downloads WHERE trackId = :id")
    suspend fun download(id: String): Download?

    @Upsert
    suspend fun setDownload(download: Download)

    @Query("UPDATE downloads SET state = :state WHERE trackId = :id")
    suspend fun setDownloadState(id: String, state: DownloadState)

    @Query("DELETE FROM downloads WHERE trackId = :id")
    suspend fun removeDownload(id: String)

    @Query("SELECT * FROM follows ORDER BY title COLLATE NOCASE")
    fun follows(): Flow<List<MusicCollection>>

    @Query("SELECT * FROM follows")
    suspend fun followList(): List<MusicCollection>

    @Upsert
    suspend fun follow(collection: MusicCollection)

    @Query("DELETE FROM follows WHERE id = :id")
    suspend fun unfollow(id: String)
}

@Database(
    entities = [Track::class, MusicCollection::class, Like::class, Playlist::class, PlaylistTrack::class, Download::class],
    version = 1,
)
abstract class MuzikDatabase : RoomDatabase() {
    abstract fun music(): MusicDao
}
