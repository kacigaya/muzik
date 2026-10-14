// Link parsing and validation share this allowlist to prevent arbitrary yt-dlp requests.
export const EXTERNAL_HOSTS = new Set(["soundcloud.com", "m.soundcloud.com", "on.soundcloud.com"]);
export const EXTERNAL_SUFFIXES = [".bandcamp.com"];

export function isExternalHost(hostname: string) {
  return EXTERNAL_HOSTS.has(hostname) || EXTERNAL_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

export function externalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return isExternalHost(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}
