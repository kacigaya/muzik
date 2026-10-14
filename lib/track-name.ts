// Shared filename contract: "NN - Title [videoId].ext" from MUZIK_OUTPUT_TEMPLATE.
// Keep Node imports out: the library browser uses this module too.
const NAMED = /^(?:(\d+)\s*-\s*)?(.*?)\s*(?:\[([A-Za-z0-9_-]{11})\])?\.[^.]+$/;

export function sourceIdFromName(name: string) {
  return NAMED.exec(name)?.[3] ?? null;
}

export function trackTitleFromName(name: string) {
  return NAMED.exec(name)?.[2]?.trim() || name;
}
