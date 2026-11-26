# Muzik

Muzik is a standalone Android app. It searches, streams, and downloads YouTube Music on the phone. No server is involved, so YouTube sees the listener's own IP address.

`web/` is the separate documentation site (Next.js). It has its own `AGENTS.md`. Its pages still describe the old self-hosted server app. `.github/workflows/pages.yml` runs `scripts/audit_dependencies.mjs` from `web/`, so keep that script.

## Toolchain

- Gradle wrapper 9.9.2, AGP 9.5.3 (built-in Kotlin), Kotlin 2.4.21, JDK 21. Verified on OpenJDK 21.0.13.1, aarch64 Linux (2026-11-26).
- Android SDK: `/home/ubuntu/android-sdk`, set in `local.properties` (not committed). The app compiles against `android-37.2`. Min SDK 26.
- The host is aarch64 Linux. `~/.gradle/gradle.properties` overrides aapt2 with a native arm64 build.
- NewPipeExtractor comes from JitPack only. `settings.gradle.kts` limits JitPack to the `com.github.teamnewpipe` and `com.github.TeamNewPipe` groups.

## Commands

```sh
./gradlew :app:testDebugUnitTest   # unit tests
./gradlew :app:lintDebug           # lint
./gradlew :app:assembleDebug       # debug APK
```

CI (`.github/workflows/ci.yml`) runs all three on each push to `main` and on pull requests. A failed run uploads reports and screenshot differences.

## Screenshot tests

- `ScreenshotTest` and `LargeScreenshotTest` (`app/src/test/kotlin/app/muzik/ui/`) use Robolectric 4.18.1 with native graphics and Roborazzi 1.79.0. They render `MuzikRoot` on SDK 35, US English, at 411dp by 891dp (xxhdpi) and 1280dp by 800dp (xhdpi), in light and dark.
- They compare against `app/src/test/screenshots/`. Differences go to `app/build/outputs/roborazzi/`. Each capture also checks that every clickable node has a name.
- Test data is fixed. The view model's `searchMusic`, `collectionTracks`, and `findLyrics` seams replace YouTube and LRCLIB, so tests never use the network. Room data comes from the test.
- `MainActivity` calls `MuzikViewModel.connect()`. Tests do not, because Robolectric cannot bind the Media3 session service.
- Ripples are off in tests, because they fade on the platform clock.
- To accept an intentional visual change:
  1. Run `./gradlew :app:testDebugUnitTest --tests 'app.muzik.ui.*ScreenshotTest' -Proborazzi.test.record=true`.
  2. Inspect each changed PNG file in both themes.
  3. Run the normal checks again. They compare without recording.
  4. Commit the references with the change.
- Do not record new references to hide an unexplained failure. Rendering can differ between host architectures.

## Architecture

- `data/YouTube.kt`: NewPipeExtractor wrapper. Search (songs, albums, playlists), collection tracks, and audio URL lookup. NewPipeExtractor uses the visionOS client and needs no PO token. Media requests must send `YouTube.mediaUserAgent`.
- `data/Music.kt`: Room entities and DAO. Tracks, likes, playlists, downloads, and follows. Exported schemas live in `app/schemas/`. A schema change needs a new database version and a migration.
- `data/Lyrics.kt`: LRCLIB lookup and the LRC parser. Downloads save an `.lrc` file next to the audio.
- `playback/Playback.kt`: Media3 `MediaSessionService`. Media items use `muzik://track/<videoId>`. `AudioResolver` turns that into a downloaded file or a fresh stream URL on the device.
- `MuzikApp` implements `Configuration.Provider`, and the manifest removes the default WorkManager initializer. WorkManager starts on first use.
- `download/Workers.kt`: WorkManager. `DownloadWorker` saves m4a audio in 4 MB ranges to `filesDir/downloads/<videoId>.m4a`. `SyncWorker` checks followed albums and playlists every 12 hours and downloads new tracks.
- `ui/`: Compose Material 3. Navigation 3 with a list-detail scene strategy, and `NavigationSuiteScaffold` (bar on phones, rail on larger screens).

## Rules

- Only validated YouTube IDs (`VIDEO_ID`, `LIST_ID` in `Music.kt`) reach file paths, URLs, or the player.
- LRCLIB gets the `Muzik/<version> ( https://github.com/kacigaya/muzik )` User-Agent. YouTube requests use a generic browser User-Agent. Send no personal data.
- Downloads are private to the app. Other apps cannot read them, and uninstalling Muzik deletes them.
- The app is GPL-3.0 because it ships NewPipeExtractor.
- Live checks on this host: the redroid devices (`adb devices`) share the server's IP address, which YouTube blocks. Search and album pages work there, but playback and downloads fail with "Sign in to confirm that you're not a bot". Test playback on a real phone.
