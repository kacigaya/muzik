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

Muzik treats everything coming back from supported music sources and a hand-edited `jobs.json` as
untrusted:

- Source ids are matched against a strict pattern before they reach yt-dlp arguments or
  name a file.
- Every downloaded path is resolved and confined to the configured music root.
- Job fields loaded from disk are re-checked rather than trusted, because the file can be
  edited by hand.

## Secrets

Navidrome credentials entered on the settings page are stored in `settings.json` at mode
`0600` in plain text, because Muzik has no user key to encrypt them with. Environment
variables take precedence and are never written to disk.

## Reporting

Open an issue at <https://github.com/kacigaya/muzik/issues>.
