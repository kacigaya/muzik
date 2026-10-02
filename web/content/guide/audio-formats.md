---
title: Audio formats
description: The difference between m4a, opus, mp3, and transcoded FLAC.
---

# Audio formats

Pick the format on the settings page, or set the default for new downloads with
`MUZIK_AUDIO_FORMAT`.

| Format | What you get |
| --- | --- |
| `m4a` | Kept as downloaded, no re-encoding |
| `opus` | Smallest files at the same quality |
| `flac` | Transcoded from lossy YouTube audio, so not lossless |
| `mp3` | Widest player support |

## About the `flac` option

`flac` re-encodes lossy YouTube audio into a lossless container. The file is larger, but no
detail comes back. It stays available because existing queues use it, and the interface
labels it as transcoded rather than lossless.

Unsupported formats in saved jobs and followed collections use the configured default.
