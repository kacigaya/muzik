import type { DownloadJob } from "./types.ts";

export function isActive(job: Pick<DownloadJob, "status">) {
  return job.status === "queued" || job.status === "running" || job.status === "retrying";
}

export function isCompleted(job: Pick<DownloadJob, "status">) {
  return job.status === "completed" || job.status === "completed_with_warnings";
}

// Navidrome filters albums by name and songs by title; unmatched titles leave the list unfiltered.
// Downloaded playlists become album folders, so use the album view for them.
export function navidromeLink(job: Pick<DownloadJob, "kind" | "title">, baseUrl: string) {
  if (!baseUrl) return null;
  const resource = job.kind === "song" ? "song" : "album";
  const filter = job.kind === "song" ? { title: job.title } : { name: job.title };
  return `${baseUrl}/app/#/${resource}?filter=${encodeURIComponent(JSON.stringify(filter))}`;
}

// Each track mounts a new audio element, so play state recorded for another track means paused.
export function isPaused(playback: { key: string; paused: boolean }, currentKey: string) {
  return playback.key !== currentKey || playback.paused;
}

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
