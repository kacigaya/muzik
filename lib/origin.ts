const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// Sibling subdomains can send CORS-simple requests, so "same-site" is not trusted.
const TRUSTED_SITES = new Set(["same-origin", "none"]);

function isAllowedOrigin(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  try {
    return allowed.includes(new URL(origin).origin);
  } catch {
    return false;
  }
}

/** Without accounts, writes rely on same-origin checks and explicit MUZIK_ALLOWED_ORIGINS. */
export function isTrustedRequest(input: {
  method: string;
  origin: string | null;
  secFetchSite: string | null;
  host: string | null;
  allowed: string[];
}): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return true;
  // Scripts cannot set Sec-Fetch-Site, so it takes precedence over Origin and Host.
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
  // Non-browser clients may omit both headers; cross-origin browser writes carry Origin.
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
