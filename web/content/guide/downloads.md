---
title: Downloads
description: How the Muzik queue runs jobs, follows collections, and recovers after a restart.
---

# Downloads

## Streaming and saved music

Streaming and downloads use separate queues. **Play** starts a playback queue. The
**Download** control saves audio files with the existing download queue.

1. Search for songs, albums, or playlists on the home page.
2. Select **Play**, or add songs to the playback queue.
3. Use the heart control to save songs in **Saved music**.
4. Create a playlist in **Saved music**, then use the playlist control on songs to add them.
5. Expand **Playback queue** to choose, move, or remove tracks.

Playback continues across Muzik pages. The browser restores its queue paused after a
reload. Likes and playlists are shared on the private server and saved in
`listening.json` under `MUZIK_DATA_DIR`.

Streaming needs no download folder. Set one in **Settings** before downloading.
YouTube audio is lossy. Streaming passes audio through the server without saving an
audio file. YouTube can block server IP addresses or make tracks unavailable. Use
**Retry** or choose another track if playback fails.

The browser queue holds 500 tracks. Each playlist holds 1000 songs. The server holds
up to 100 playlists and 5000 liked songs. There is no offline playback or YouTube
account sync. Browser rules can limit automatic or background playback.

## How a download works

1. The queue accepts one job at a time and writes every state change to `jobs.json`.
2. Jobs run through yt-dlp, which downloads audio, converts it to the selected format
   when needed, and embeds metadata and artwork.
3. Finished files are re-read with ffprobe and ffmpeg. Album artist and year come from
   whatever the tracks agree on, and the genre comes from the artist's MusicBrainz tags,
   cached per artist and rate limited to one request per second. Unknown artists get `Other`.
4. Lyrics are fetched when enabled, and if a Navidrome container is configured, a full scan runs.

## Queue behaviour

The queue keeps the last 100 finished jobs and drops the rest. Jobs that were running when
the process stopped are re-queued at startup. The browser follows progress over
`GET /api/jobs/stream`, a server-sent event stream, and falls back to polling when a proxy
buffers it.

A download will not start when the disk is nearly full. `MUZIK_MIN_FREE_MB` sets the
threshold, and `0` disables the check.

## Following a collection

Any album or playlist can be followed from its search result. Muzik re-queues it every
`intervalHours` (24 by default) and yt-dlp's download archive skips everything already on
disk, so a sync only pulls what was added since the last run. The scheduler runs in the
server process and also catches up once at startup, so a machine that was off overnight
still syncs when it comes back.

## Library browser

`/library` walks the music folder, shows what Muzik wrote, and can queue a track again from
the video id stored in its file name. Deleting is off unless `MUZIK_ALLOW_DELETE=1` is set,
because Muzik has no accounts: anyone who can reach the page can use whatever it allows.
Deleting a track also drops it from the download archive, otherwise yt-dlp would skip it
forever after.
