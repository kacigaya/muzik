import { VIDEO_ID } from "./source-ids.ts";
import type { SearchItem } from "./types.ts";

export type SavedPlaylist = { id: string; name: string; tracks: SearchItem[] };
export type ListeningLibrary = { likes: SearchItem[]; playlists: SavedPlaylist[] };
export const MAX_QUEUE = 500;

export function listeningTrack(value: unknown): SearchItem {
  if (!value || typeof value !== "object") throw new Error("Invalid track.");
  const track = value as Record<string, unknown>;
  if (track.kind !== "song" || track.url || typeof track.sourceId !== "string" || !VIDEO_ID.test(track.sourceId)) {
    throw new Error("Only YouTube Music songs can be saved or played.");
  }
  const text = (value: unknown): string => {
    if (typeof value !== "string" || !value.trim() || value.length > 300) throw new Error("Invalid track text.");
    return value.trim();
  };
  const optionalText = (value: unknown) => value == null ? null : text(value);
  const number = (value: unknown, max: number) => {
    if (value == null) return null;
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > max) throw new Error("Invalid track number.");
    return value;
  };
  let thumbnail: string | null = null;
  if (track.thumbnail != null) {
    if (typeof track.thumbnail !== "string" || track.thumbnail.length > 1000) throw new Error("Invalid artwork URL.");
    const url = new URL(track.thumbnail);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid artwork URL.");
    thumbnail = url.href;
  }
  return {
    kind: "song", sourceId: track.sourceId, title: text(track.title), subtitle: text(track.subtitle),
    artist: optionalText(track.artist), album: optionalText(track.album), thumbnail,
    durationSeconds: number(track.durationSeconds, 86400), trackNumber: number(track.trackNumber, 10000), itemCount: null,
  };
}

export type ListeningCommand =
  | { action: "like"; track: SearchItem }
  | { action: "unlike"; sourceId: string }
  | { action: "create"; name: string }
  | { action: "rename"; id: string; name: string }
  | { action: "delete"; id: string }
  | { action: "add"; id: string; tracks: SearchItem[] }
  | { action: "remove"; id: string; sourceId: string };

function name(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 100) throw new Error("Playlist name must contain 1 to 100 characters.");
  return value.trim();
}

export function listeningCommand(value: unknown): ListeningCommand {
  if (!value || typeof value !== "object") throw new Error("Invalid library action.");
  const data = value as Record<string, unknown>;
  if (data.action === "like") return { action: "like", track: listeningTrack(data.track) };
  if (data.action === "create") return { action: "create", name: name(data.name) };
  if (data.action === "unlike") {
    if (typeof data.sourceId !== "string" || !VIDEO_ID.test(data.sourceId)) throw new Error("Invalid song ID.");
    return { action: "unlike", sourceId: data.sourceId };
  }
  if (typeof data.id !== "string" || !/^[a-f0-9-]{36}$/.test(data.id)) throw new Error("Invalid playlist ID.");
  if (data.action === "delete") return { action: "delete", id: data.id };
  if (data.action === "rename") return { action: "rename", id: data.id, name: name(data.name) };
  if (data.action === "remove" && typeof data.sourceId === "string" && VIDEO_ID.test(data.sourceId)) {
    return { action: "remove", id: data.id, sourceId: data.sourceId };
  }
  if (data.action === "add" && Array.isArray(data.tracks) && data.tracks.length > 0 && data.tracks.length <= MAX_QUEUE) {
    return { action: "add", id: data.id, tracks: data.tracks.map(listeningTrack) };
  }
  throw new Error("Invalid library action.");
}

export function updateListeningLibrary(library: ListeningLibrary, command: ListeningCommand, newId: string): ListeningLibrary {
  const next: ListeningLibrary = structuredClone(library);
  if (command.action === "like") {
    if (!next.likes.some((track) => track.sourceId === command.track.sourceId)) {
      if (next.likes.length >= 5000) throw new Error("The liked songs limit is 5000.");
      next.likes.unshift(command.track);
    }
  } else if (command.action === "unlike") next.likes = next.likes.filter((track) => track.sourceId !== command.sourceId);
  else if (command.action === "create") {
    if (next.playlists.length >= 100) throw new Error("The playlist limit is 100.");
    next.playlists.push({ id: newId, name: command.name, tracks: [] });
  } else {
    const playlist = next.playlists.find((entry) => entry.id === command.id);
    if (!playlist) throw new Error("Playlist not found. Reload your library.");
    if (command.action === "delete") next.playlists = next.playlists.filter((entry) => entry.id !== command.id);
    if (command.action === "rename") playlist.name = command.name;
    if (command.action === "remove") playlist.tracks = playlist.tracks.filter((track) => track.sourceId !== command.sourceId);
    if (command.action === "add") {
      const ids = new Set(playlist.tracks.map((track) => track.sourceId));
      for (const track of command.tracks) {
        if (!ids.has(track.sourceId)) { playlist.tracks.push(track); ids.add(track.sourceId); }
      }
      if (playlist.tracks.length > 1000) throw new Error("The playlist track limit is 1000.");
    }
  }
  return next;
}

export type PlaybackQueue = { tracks: SearchItem[]; index: number };
export type QueueAction =
  | { type: "play"; tracks: SearchItem[] }
  | { type: "enqueue"; tracks: SearchItem[] }
  | { type: "select"; index: number }
  | { type: "remove"; index: number }
  | { type: "move"; index: number; direction: -1 | 1 }
  | { type: "clear" };

export function updateQueue(queue: PlaybackQueue, action: QueueAction): PlaybackQueue {
  if (action.type === "clear") return { tracks: [], index: 0 };
  if (action.type === "play") return { tracks: action.tracks.slice(0, MAX_QUEUE), index: 0 };
  if (action.type === "enqueue") return { ...queue, tracks: [...queue.tracks, ...action.tracks].slice(0, MAX_QUEUE) };
  if (action.type === "select") return action.index >= 0 && action.index < queue.tracks.length ? { ...queue, index: action.index } : queue;
  if (action.index < 0 || action.index >= queue.tracks.length) return queue;
  const tracks = [...queue.tracks];
  if (action.type === "move") {
    const target = action.index + action.direction;
    if (target < 0 || target >= tracks.length) return queue;
    [tracks[action.index], tracks[target]] = [tracks[target], tracks[action.index]];
    const index = queue.index === action.index ? target : queue.index === target ? action.index : queue.index;
    return { tracks, index };
  }
  tracks.splice(action.index, 1);
  return { tracks, index: Math.max(0, Math.min(queue.index - (action.index < queue.index ? 1 : 0), tracks.length - 1)) };
}

export function restoreQueue(value: unknown): PlaybackQueue {
  if (!value || typeof value !== "object") throw new Error("Invalid saved queue.");
  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.tracks) || data.tracks.length > MAX_QUEUE || typeof data.index !== "number" || !Number.isInteger(data.index)) throw new Error("Invalid saved queue.");
  const tracks = data.tracks.map(listeningTrack);
  return { tracks, index: Math.max(0, Math.min(data.index, tracks.length - 1)) };
}
