---
title: Deploy
description: First-run setup, the absence of authentication, origin checks, and routing downloads through a VPN container.
---

# Deploy

## First run

Muzik asks for a music folder the first time you open it and writes the answer to
`settings.json` in the data directory. In Docker the answer is `/music`, which is where
your library is mounted.

The folder is created if it does not exist, and it has to be an absolute path the Muzik
process can write to. Since Muzik has no accounts, the setup screen only accepts a folder
while none is configured. Changing it later means editing `settings.json` or setting
`MUZIK_MUSIC_DIR`. That variable also skips the screen entirely, which is what you want
for an automated deployment.

## There is no authentication

Muzik has no login. Bind it to a private interface or put it behind whatever front end you
already use for the rest of your services.

Since same-origin is the only boundary left, the API refuses a state-changing request that
a browser reports as coming from somewhere else. That stops a page you happen to be
visiting from queueing downloads or deleting tracks on your behalf, but it is not a
substitute for keeping Muzik off the open internet. Clients that are not browsers, such as
`curl` or the container health check, are unaffected. Set `MUZIK_ALLOWED_ORIGINS` if
another hostname of yours has to reach the API.

## Routing downloads through a VPN

`MUZIK_VPN_CONTAINER` and `MUZIK_NAVIDROME_CONTAINER` shell out to a container runtime
through `sudo -n`, which suits a host install more than a container. In Compose, share the
VPN container's network instead:

```yaml
services:
  muzik:
    network_mode: "service:gluetun"
```

Without either variable, yt-dlp uses the network it already has and your library server
picks new files up on its own next scan.

## Health checks

`GET /api/health` answers for uptime checks, and the Docker image uses it as its own health
check.
