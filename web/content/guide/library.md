---
title: Library and metadata
description: How Muzik names files, normalizes album artist and year, and assigns one genre per download.
---

# Library and metadata

## File layout

Downloads are written as `Artist/Album/NN - Title [id].ext`. The bracketed id is the
YouTube video id, which is what lets the library browser re-queue a track later. Change the
layout with `MUZIK_OUTPUT_TEMPLATE`, which takes a yt-dlp output template.

## Normalization

Finished files are re-read with ffprobe and ffmpeg. Album artist and album year come from
whatever the tracks in a folder agree on, rather than from any single file.

The genre comes from the artist's MusicBrainz tags, narrowed to one broad genre per
download. Lookups are cached per artist in the data directory and rate limited to one
request per second. Artists MusicBrainz does not recognize get `Other`.

## Normalizing files you already have

The same pass runs over an existing library without downloading anything:

```bash
npm run organize
```

## Duplicate protection

Two mechanisms keep a track from arriving twice: yt-dlp's download archive in the data
directory, and a queue that refuses to add a source that is already queued or running.
Deleting a track from the library browser also drops it from the archive, otherwise yt-dlp
would skip it forever after.
