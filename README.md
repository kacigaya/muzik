<h1 align="center">Muzik</h1>

<p align="center">
  <strong>A YouTube Music player for Android that runs entirely on your phone.</strong>
</p>

Muzik searches, streams, and downloads YouTube Music on the device. There is no server, so YouTube sees your own IP address, as it does in its own app.

## Features

- Search songs, albums, and playlists.
- Stream with background playback, lock-screen controls, and Bluetooth controls.
- Like songs and build playlists. Everything stays on the phone.
- Download songs, albums, and playlists for offline play.
- Follow an album or playlist. Muzik checks it every 12 hours and downloads new tracks.
- Synced lyrics from [LRCLIB](https://lrclib.net). Tap a line to jump to it.
- A bottom bar on phones, and a navigation rail with list and detail side by side on tablets and foldables.

## Requirements

- Android 8.0 (API 26) or later.

## Install

Download `muzik-<version>.apk` from the [latest release](https://github.com/kacigaya/muzik/releases). Check it against `SHA256SUMS.txt`, then open it on your phone. Alpha releases are pre-releases.

## Build

1. Install JDK 21 and the Android SDK with platform `android-37.2` and build-tools `36.0.0`.
2. Set `sdk.dir` in `local.properties`.
3. Run the checks and build the debug APK:

```sh
./gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

The APK is in `app/build/outputs/apk/debug/`.

Screenshot tests run with the unit tests. They compare the screens with the images in `app/src/test/screenshots/`. To record new images after an intended change, add `-Proborazzi.test.record=true`.

Release builds are signed when `MUZIK_KEYSTORE`, `MUZIK_KEYSTORE_PASSWORD`, `MUZIK_KEY_ALIAS`, and `MUZIK_KEY_PASSWORD` are set. You can also set them as Gradle properties (`muzik.keystore` and so on).

## Limits

- Downloads are private to Muzik. Other music apps cannot see them, and they are deleted when you uninstall Muzik. Files are not tagged.
- The queue is not saved when Android stops the app.
- If YouTube blocks your network ("Sign in to confirm you're not a bot"), try another network, such as mobile data.

## How it works

[NewPipeExtractor](https://github.com/TeamNewPipe/NewPipeExtractor) reads YouTube Music search results, playlists, and audio streams. Media3 ExoPlayer plays them. Room stores likes, playlists, downloads, and follows. WorkManager runs downloads and follow checks.

## License

GPL-3.0. Muzik includes NewPipeExtractor, which is GPL-3.0. See [LICENSE](LICENSE).

Muzik is not affiliated with YouTube or Google.
