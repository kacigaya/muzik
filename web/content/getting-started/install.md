---
title: Install
description: Run Muzik with Docker, Docker Compose, or from source with Node.js and Python.
---

# Install

## Docker

```bash
docker build -t muzik .
docker run -d --name muzik \
  -p 3020:3020 \
  -v /path/to/your/music:/music \
  -v muzik-data:/data \
  muzik
```

The image bundles ffmpeg, yt-dlp, and the Python bridges, and sets the paths and Python
bindings so `/music` and `/data` work out of the box.

`/data` holds the queue, the download archive, the MusicBrainz cache, and your chosen
library path. Keep it on a volume if you want any of that to survive a restart.

## Compose

Point the music volume in `compose.yaml` at your library, then:

```bash
docker compose up -d
```

## From source

Prerequisites:

- Node.js 22+
- Python 3.12+
- ffmpeg on `PATH`

```bash
npm install
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Start the development server:

```bash
npm run dev
```

Open <http://localhost:3000>.

`npm run start` serves the production build on `127.0.0.1:3020`. Set `HOST` and `PORT` to
change that.
