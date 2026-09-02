---
title: Muzik
description: A self-hosted YouTube Music search and download front end that writes tagged, organized files into a library you own.
---

# Muzik

Muzik is a search and download front end for your own music library. Search YouTube Music
or paste a link, queue the download, and the tracks land tagged on disk in an
`Artist/Album/Track` layout that Navidrome, Jellyfin, Plex, or a plain file browser can
read. It has no accounts and no database.

## What it does

- Search songs, albums, and playlists from YouTube Music, with live suggestions while typing.
- Paste a link instead of searching: YouTube, YouTube Music, SoundCloud, or Bandcamp. A
  `watch?v=…&list=…` link offers both the single song and the full collection.
- Expand an album or playlist to see its tracks and queue only the ones you want.
- Follow an album or playlist so Muzik re-checks it on a schedule.
- Watch a serial queue with live progress, speed, and time remaining, plus cancel and
  retry. Queue state is written to disk and recovered after a restart.
- Browse what has been downloaded, re-queue a track, or delete files once deleting is enabled.
- Pick m4a, opus, mp3, legacy transcoded FLAC, or [authorized Qobuz lossless](/docs/guide/qobuz-lossless/).
- Get one broad genre per download from MusicBrainz tags, with album artist and album year
  normalized from the files themselves.
- Write [synced lyrics](/docs/guide/navidrome-lyrics/) next to each track as `.lrc`.
- Install it as a PWA, with `/` and `⌘K` shortcuts, light and dark themes, and a queue bar
  that follows you on mobile.

Muzik refuses to start a download when the disk is nearly full instead of failing halfway
through, and a yt-dlp download archive plus a queue that rejects duplicate sources keeps
the same track from arriving twice.

## Where to start

- [Install](/docs/getting-started/install/) covers Docker, Compose, and running from source.
- [Deploy](/docs/getting-started/deploy/) covers first run, the missing authentication, and VPN routing.
- [Configuration](/docs/reference/configuration/) lists every environment variable.

## Tech stack

- Framework: Next.js 16 (App Router)
- UI: React 19, Tailwind CSS 4, [coss ui](https://coss.com/ui) components on Base UI, Lucide and morphicons
- Language: TypeScript
- Downloader: yt-dlp with ffmpeg
- Metadata: ytmusicapi for YouTube Music, yt-dlp for other sources, mutagen for tag
  rewriting, MusicBrainz for genre, lrclib.net for lyrics
- Testing: `node --test` for the TypeScript modules, `unittest` for the Python bridge

## Licence and use

Muzik is MIT licensed. Normal downloads talk to public, anonymous YouTube Music. There is
no YouTube login and no cookie jar. Optional Qobuz lossless mode uses only the credentials
supplied in the server environment. Use every source only for content you are allowed to save.
