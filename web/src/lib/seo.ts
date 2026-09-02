export const SITE_URL = "https://kacigaya.github.io/muzik";
export const SITE_NAME = "Muzik";
export const SOCIAL_IMAGE_URL = `${SITE_URL}/muzik-og.png`;
export const DEFAULT_TITLE = "Muzik: Self-hosted Music Downloader for Your Own Library";
export const DEFAULT_DESCRIPTION =
  "Muzik is a self-hosted YouTube Music downloader that writes tagged, organized files a Navidrome, Jellyfin, or Plex library can read. Search, queue, follow albums, fetch synced lyrics, and download authorized Qobuz lossless FLAC.";

export const SEO_KEYWORDS = [
  "self-hosted music downloader",
  "YouTube Music downloader",
  "yt-dlp web interface",
  "Navidrome downloader",
  "music library organizer",
  "synced lyrics lrc",
  "Qobuz lossless FLAC",
  "MusicBrainz genre tagging",
  "self-hosted music server",
  "Muzik",
];

export function canonicalUrl(path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalized}`;
}
