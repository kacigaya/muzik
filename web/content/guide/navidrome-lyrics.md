---
title: Navidrome and lyrics
description: Link finished downloads into Navidrome, trigger a scan after each download, and write synced .lrc files.
---

# Navidrome and lyrics

## Navidrome links and scans

Set `NAVIDROME_URL` to add links from finished downloads into a Navidrome web UI. The value
is ignored unless it is a plain HTTP or HTTPS address.

To scan Navidrome after a download, set `NAVIDROME_URL` and either
`MUZIK_NAVIDROME_API_KEY` or both `MUZIK_NAVIDROME_USERNAME` and
`MUZIK_NAVIDROME_PASSWORD`. Muzik calls the OpenSubsonic `startScan` endpoint. If API
credentials are unset, it uses `MUZIK_NAVIDROME_CONTAINER` as a local fallback and runs
`navidrome scan` there.

Without any of this, your library server picks new files up on its own next scan.

## Credentials on the settings page

Navidrome credentials can be entered on the settings page instead of set in the
environment. Those are written to `settings.json` in the data directory in plain text, with
the file mode set to `0600`, because Muzik has no accounts and so no user key to encrypt
them with.

The API key and the password never come back out to the browser. The settings page is only
told whether each is configured, but anyone who can read the data directory can read them.
Prefer the environment variables if that matters to you. They take precedence and are never
written to disk.

The Subsonic password scheme hashes the password with a per-request salt, so Muzik has to
keep the password itself and not a hash of it.

## Synced lyrics

With `MUZIK_LYRICS=1`, each finished track is looked up on lrclib.net by artist, title,
album, and duration, and a matching `.lrc` is written next to the audio file.

This sends those track names to a third-party service, which is why it is off by default.
Failures are ignored: a download does not become broken because a lyrics server was
unreachable.
