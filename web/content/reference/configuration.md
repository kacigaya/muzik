---
title: Configuration
description: Every Muzik environment variable, its default, and what it controls.
---

# Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `MUZIK_MUSIC_DIR` | unset | Pins the library root and skips the first-run screen |
| `MUZIK_DEFAULT_MUSIC_DIR` | unset | Prefills the first-run screen without pinning anything |
| `MUZIK_DATA_DIR` | `/srv/muzik/data` | Queue state, chosen library path, download archive, MusicBrainz artist cache |
| `MUZIK_TEMP_DIR` | `/srv/muzik/tmp` | Per-job scratch space, cleared when the job ends |
| `MUZIK_PYTHON` | `.venv/bin/python` | Interpreter for the search and resolve bridges |
| `MUZIK_YTDLP` | `.venv/bin/yt-dlp` | Downloader binary |
| `NAVIDROME_URL` | unset | Adds links from finished downloads into a Navidrome web UI. Ignored unless it is a plain HTTP or HTTPS address |
| `MUZIK_NAVIDROME_API_KEY` | unset | OpenSubsonic API key used to request a quick Navidrome scan after a download |
| `MUZIK_NAVIDROME_USERNAME` | unset | Navidrome username used when no API key is configured |
| `MUZIK_NAVIDROME_PASSWORD` | unset | Navidrome password used with `MUZIK_NAVIDROME_USERNAME` |
| `MUZIK_NAVIDROME_CONTAINER` | unset | Fallback container to run `navidrome scan` in after a download |
| `MUZIK_VPN_CONTAINER` | unset | Container whose network namespace yt-dlp joins |
| `MUZIK_CONTAINER_CLI` | `podman` | Command used for the two options above |
| `MUZIK_AUDIO_FORMAT` | `m4a` | Default format for new downloads: `m4a`, `opus`, `lossless`, `flac`, or `mp3` |
| `MUZIK_QOBUZ_APP_ID` | unset | Qobuz-issued application ID used only by the server |
| `MUZIK_QOBUZ_APP_SECRET` | unset | Qobuz-issued application secret used to sign file URL requests |
| `MUZIK_QOBUZ_USER_AUTH_TOKEN` | unset | User token for an entitled Qobuz account |
| `MUZIK_QOBUZ_QUALITY` | `27` | Preferred Qobuz FLAC tier: `27`, `7`, or `6`. Lower lossless tiers are tried in that order |
| `MUZIK_QOBUZ_CDN_HOSTS` | unset | Required comma-separated HTTPS hostname allowlist for signed Qobuz audio URLs |
| `MUZIK_OUTPUT_TEMPLATE` | `Artist/Album/NN - Title [id].ext` | yt-dlp output template for downloaded files |
| `MUZIK_MIN_FREE_MB` | `500` | Free space a download requires before it starts. `0` disables the check |
| `MUZIK_LYRICS` | unset | Set to `1` to fetch synced lyrics from lrclib.net |
| `MUZIK_ALLOW_DELETE` | unset | Set to `1` to allow deleting files from the library browser |
| `MUZIK_ALLOWED_ORIGINS` | unset | Comma-separated origins allowed to make state-changing API requests on top of Muzik's own |

The Docker image sets the paths and the Python bindings so `/music` and `/data` work out of
the box.
