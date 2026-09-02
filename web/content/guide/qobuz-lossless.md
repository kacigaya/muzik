---
title: Qobuz lossless
description: Configure authorized Qobuz credentials so matched tracks download as native FLAC, with YouTube AAC or Opus as the fallback.
---

# Authorized Qobuz lossless

`lossless` is a separate option from `flac`. With `lossless`, Muzik searches Qobuz using
explicit title, artist, album, duration, version, and optional track number metadata. A
strict match is downloaded as its native FLAC. Missing matches, unavailable quality tiers,
entitlement errors, timeouts, and invalid payloads fall back to YouTube's native AAC or
Opus audio without FLAC transcoding.

## What you need

All five variables are server-side configuration.

| Variable | Default | Purpose |
| --- | --- | --- |
| `MUZIK_QOBUZ_APP_ID` | unset | Qobuz-issued application ID used only by the server |
| `MUZIK_QOBUZ_APP_SECRET` | unset | Qobuz-issued application secret used to sign file URL requests |
| `MUZIK_QOBUZ_USER_AUTH_TOKEN` | unset | User token for an entitled Qobuz account |
| `MUZIK_QOBUZ_QUALITY` | `27` | Preferred FLAC tier: `27`, `7`, or `6`. Lower lossless tiers are tried in that order |
| `MUZIK_QOBUZ_CDN_HOSTS` | unset | Required comma-separated HTTPS hostname allowlist for signed Qobuz audio URLs |

If any required setting is absent, lossless resolution stays disabled and downloads
continue through YouTube fallback.

## Terms of use

Muzik does not support password login, shared accounts, web-player secret extraction, or
embedded credentials. Only use credentials Qobuz issued to you, with an entitled user
account and a written agreement that permits permanent downloads for your use. Do not share
application credentials.

## Albums

Albums and followed albums use the same track-by-track flow and may contain both Qobuz FLAC
and YouTube AAC/Opus files. When the album's track list cannot be read at all, the job
hands itself back to yt-dlp, which downloads the playlist on its own, so one search outage
does not fail the album. Playlists and external links always take that path.

## How a file is validated

Before a Qobuz file reaches the library, Muzik checks every signed URL and every redirect
against `MUZIK_QOBUZ_CDN_HOSTS`, refuses anything that is not HTTPS, verifies the `fLaC`
file signature, confirms with ffprobe that the audio really is FLAC at the reported bit
depth and sample rate, and only then places the tagged file atomically. An MP3 result is
never accepted as lossless.
