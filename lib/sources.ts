/**
 * Sources yt-dlp resolves directly. Kept apart from link parsing and validation so both
 * can share one allowlist: a job's URL reaches yt-dlp, so anything not listed here would
 * turn the queue into a request forwarder.
 */
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

/**
 * Hosts the lossless provider is allowed to hand a stream back from. That URL is chosen
 * by a remote server and then downloaded, so it is confined the same way link sources
 * are: without an allowlist the provider could point the queue at any address the server
 * can reach. Unset means no host is allowed, which keeps the provider off by default.
 */
export function losslessCdnHosts() {
  return (process.env.MUZIK_LOSSLESS_CDN_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function losslessStreamUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const hostname = url.hostname.toLowerCase();
  const allowed = losslessCdnHosts().some((host) => hostname === host || hostname.endsWith(`.${host}`));
  return allowed ? url.toString() : null;
}
