---
title: Downloads
description: How the Muzik queue runs jobs, follows collections, and recovers after a restart.
---

# Downloads

## How a download works

1. The queue accepts one job at a time and writes every state change to `jobs.json`.
2. Normal jobs run through yt-dlp. Lossless song and album jobs first resolve a strict
   Qobuz match, validate every signed URL and redirect against the configured CDN hosts,
   verify the FLAC signature, and place the tagged file atomically. Track ids coming back
   from an album listing are checked before they name a file, and a track carrying an
   unusable id is skipped and counted as a warning. Unmatched tracks use native YouTube
   AAC or Opus instead.
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
