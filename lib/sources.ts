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
 * Hosts Qobuz is allowed to return for a signed stream. That URL is chosen remotely and
 * downloaded by the server, so an empty allowlist disables Qobuz resolution by default.
 */
export function qobuzCdnHosts() {
  return (process.env.MUZIK_QOBUZ_CDN_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => (
      entry.length > 0
      && entry.length <= 253
      && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(entry)
      && !entry.includes("..")
    ));
}

export function qobuzStreamUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const hostname = url.hostname.toLowerCase();
  const allowed = qobuzCdnHosts().some((host) => hostname === host || hostname.endsWith(`.${host}`));
  return allowed ? url.toString() : null;
}
