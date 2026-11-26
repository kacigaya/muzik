export function formatTime(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

/** yt-dlp reports seconds; anything past an hour is shown as hours and minutes. */
export function formatRemaining(seconds: number): string {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${seconds}s`;
}

const ARTWORK_HOSTS = ["ytimg.com", "ggpht.com", "googleusercontent.com"];

// Collection links carry artwork in the URL, so only YouTube Music image hosts may load from it.
export function trustedArtwork(value: string | null | undefined): string | null {
  if (!value || value.length > 1000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return ARTWORK_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.href : null;
  } catch {
    return null;
  }
}

export function totalMinutes(tracks: { durationSeconds: number | null }[]): number {
  return Math.round(tracks.reduce((sum, track) => sum + (track.durationSeconds ?? 0), 0) / 60);
}
