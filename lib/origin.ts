const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// "same-site" is not trusted: a sibling subdomain is a different application, and it can
// still reach Muzik with a CORS-simple request.
const TRUSTED_SITES = new Set(["same-origin", "none"]);

function isAllowedOrigin(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  try {
    return allowed.includes(new URL(origin).origin);
  } catch {
    return false;
  }
}

/**
 * Muzik has no accounts, so same-origin is its only trust boundary. A state-changing
 * request is trusted when the browser says it came from Muzik itself, or when the
 * operator has listed the caller in MUZIK_ALLOWED_ORIGINS.
 */
export function isTrustedRequest(input: {
  method: string;
  origin: string | null;
  secFetchSite: string | null;
  host: string | null;
  allowed: string[];
}): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return true;
  // Every browser that can send a forged request also sends Sec-Fetch-Site, and it cannot
  // be set by script, so it decides on its own when present.
  if (input.secFetchSite) {
    return TRUSTED_SITES.has(input.secFetchSite) || isAllowedOrigin(input.origin, input.allowed);
  }
  if (input.origin) {
    let origin: URL;
    try {
      origin = new URL(input.origin);
    } catch {
      return false;
    }
    return origin.host === input.host || input.allowed.includes(origin.origin);
  }
  // Non-browser clients (curl, the container HEALTHCHECK, scripts) send neither header.
  // A browser always sends Origin on a cross-origin unsafe request, so nothing forged
  // reaches this line.
  return true;
}

/** Extra origins the operator trusts, for deployments fronted by another hostname. */
export function allowedOrigins(): string[] {
  const origins: string[] = [];
  for (const entry of (process.env.MUZIK_ALLOWED_ORIGINS ?? "").split(",")) {
    const value = entry.trim();
    if (!value) continue;
    try {
      origins.push(new URL(value).origin);
    } catch {
      continue;
    }
  }
  return origins;
}
