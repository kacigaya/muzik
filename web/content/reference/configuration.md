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
| `MUZIK_LIDARR_ENABLED` | unset | Overrides the Lidarr toggle: `1`, `true`, `yes`, or `on` enables registration; other non-empty values disable it. Unset leaves it to Settings, disabled by default |
| `MUZIK_LIDARR_URL` | unset | Lidarr HTTP(S) URL, including any reverse-proxy base path |
| `MUZIK_LIDARR_API_KEY` | unset | Lidarr API key, sent server-side through `X-Api-Key`; set `MUZIK_LIDARR_URL` alongside it |
| `MUZIK_LIDARR_MUSIC_DIR` | unset | Absolute Linux path to Muzik's shared music folder as seen by Lidarr. Blank uses Muzik's music root |
| `MUZIK_VPN_CONTAINER` | unset | Container whose network namespace yt-dlp joins |
| `MUZIK_CONTAINER_CLI` | `podman` | Command used for the two options above |
| `MUZIK_AUDIO_FORMAT` | `m4a` | Default format for new downloads: `m4a`, `opus`, `flac`, or `mp3` |
| `MUZIK_OUTPUT_TEMPLATE` | `Artist/Album/NN - Title [id].ext` | yt-dlp output template for downloaded files |
| `MUZIK_MIN_FREE_MB` | `500` | Free space a download requires before it starts. `0` disables the check |
| `MUZIK_LYRICS` | unset | Overrides the lyrics toggle on the settings page: `1` always fetches synced lyrics from lrclib.net, `0` never does. Unset leaves it to the toggle, which is on by default |
| `MUZIK_ALLOW_DELETE` | unset | Set to `1` to allow deleting files from the library browser |
| `MUZIK_ALLOWED_ORIGINS` | unset | Comma-separated origins allowed to make state-changing API requests on top of Muzik's own |

The Docker image sets the paths and the Python bindings so `/music` and `/data` work out of
the box.

## Lidarr

Configure Lidarr through Muzik's Settings, or use the variables above. Environment
overrides lock their corresponding form fields. Saved keys stay on the server;
leaving the key blank preserves it, but changing servers requires a new key.
**Test connection** checks unsaved form values without saving them, verifies API
access, and checks that the mapped music root belongs to an accessible Lidarr
root folder.

Both applications must see the same files. For example, mount the same host music
folder at `/music` in Muzik and `/media/music` in Lidarr, then set
`MUZIK_LIDARR_MUSIC_DIR=/media/music`. Mapping changes only paths sent to Lidarr;
Muzik keeps its `Artist/Album/Track` layout.

Registration uses Lidarr API v1 to scan only the affected folders, with new artist
creation disabled. Add artists in Lidarr first. Songs, albums, and playlists are
attempted, but unmatched or incomplete releases can require review in Lidarr.
Lidarr may update tags according to its own settings; Muzik requests no moves or
renames. Lidarr's root path and Muzik's downloads must use Linux paths.

The queue shows recognition counts after the scan completes. A warning never
changes a successful download into a failed download. **Retry Lidarr** retries
registration only. There are no automatic failure retries or historical-library
backfills. Known pending scans resume after restart; interrupted submissions,
settings changes, and scans exceeding five minutes require manual retry.
Keep failed registrations in the queue until resolved; clearing them removes
their retry state. Running Lidarr registrations survive **Clear finished downloads**.
