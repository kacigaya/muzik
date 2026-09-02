---
title: Security
description: What Muzik trusts, what it validates, and what it deliberately leaves to you.
---

# Security

## No authentication

Muzik has no accounts and no login. Anyone who can reach the page can use everything it
allows, including deleting files when `MUZIK_ALLOW_DELETE=1`. Bind it to a private interface
or put it behind your existing front end. See [Deploy](/docs/getting-started/deploy/).

## Origin checks

The API refuses a state-changing request that a browser reports as coming from another
origin. That stops a page you happen to be visiting from queueing downloads or deleting
tracks on your behalf. It is not a substitute for keeping Muzik off the open internet, and
it does not apply to non-browser clients such as `curl`. Add trusted hostnames with
`MUZIK_ALLOWED_ORIGINS`.

## Untrusted input

Muzik treats everything coming back from YouTube, Qobuz, and a hand-edited `jobs.json` as
untrusted:

- Source ids are matched against a strict pattern before they reach yt-dlp arguments or
  name a file, including track ids returned by an album listing.
- Every downloaded path is resolved and confined to the configured music root.
- Job fields loaded from disk are re-checked rather than trusted, because the file can be
  edited by hand.
- Signed Qobuz stream URLs and every redirect must be HTTPS and must match
  `MUZIK_QOBUZ_CDN_HOSTS`. An empty allowlist disables Qobuz resolution entirely.
- Downloaded FLAC is bounded in size, checked for the `fLaC` signature, and probed with
  ffprobe before it is placed.

## Secrets

Navidrome credentials entered on the settings page are stored in `settings.json` at mode
`0600` in plain text, because Muzik has no user key to encrypt them with. Environment
variables take precedence and are never written to disk. Qobuz credentials are read only
from the environment and are never accepted from the browser.

## Reporting

Open an issue at <https://github.com/kacigaya/muzik/issues>.
