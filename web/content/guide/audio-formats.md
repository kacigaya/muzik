---
title: Audio formats
description: The difference between m4a, opus, mp3, transcoded FLAC, and authorized Qobuz lossless.
---

# Audio formats

Pick the format on the settings page, or set the default for new downloads with
`MUZIK_AUDIO_FORMAT`.

| Format | What you get |
| --- | --- |
| `m4a` | Kept as downloaded, no re-encoding |
| `opus` | Smallest files at the same quality |
| `lossless` | Qobuz FLAC when authorized, otherwise native AAC or Opus |
| `flac` | Transcoded from lossy YouTube audio, so not lossless |
| `mp3` | Widest player support |

## About the `flac` option

`flac` re-encodes lossy YouTube audio into a lossless container. The file is larger, but no
detail comes back. It stays available because existing queues use it, and the interface
labels it as transcoded rather than lossless.

If you want genuinely lossless files, see [Qobuz lossless](/docs/guide/qobuz-lossless/).

## What the queue reports

Queue cards show the real source of each finished track, so a fallback is never labeled
lossless. A mixed album reports its Qobuz FLAC count, its YouTube AAC/Opus count, and how
many tracks were skipped because they were already on disk.
