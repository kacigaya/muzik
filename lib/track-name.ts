/**
 * The shape yt-dlp writes through MUZIK_OUTPUT_TEMPLATE: "NN - Title [videoId].ext".
 * Both halves of the app read it, so the contract lives in one place. This module stays
 * free of node imports because the library browser runs in the browser.
 */
const NAMED = /^(?:(\d+)\s*-\s*)?(.*?)\s*(?:\[([A-Za-z0-9_-]{11})\])?\.[^.]+$/;

/** Muzik names downloads "... [videoId].ext", which is how a track finds its source again. */
export function sourceIdFromName(name: string) {
  return NAMED.exec(name)?.[3] ?? null;
}

/** The title as it was tagged, for showing a track without its track number or video id. */
export function trackTitleFromName(name: string) {
  return NAMED.exec(name)?.[2]?.trim() || name;
}
