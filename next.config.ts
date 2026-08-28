import type { NextConfig } from "next";

/**
 * Muzik has no accounts, so anyone who can reach the page can use everything it offers.
 * These headers keep another origin from reaching it indirectly: framing the UI to trick
 * a click through to the delete button, or reading a response it should not have.
 *
 * There is no script-src here on purpose. Next serves inline bootstrap scripts, so a
 * useful script-src needs per-request nonces, which is a larger change than this one.
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Thumbnails come from YouTube's CDN. Every <img> already opts out individually; this
  // keeps the library hostname out of any request the markup does not control.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Naming the framework and its version helps nobody but someone scanning for it.
  poweredByHeader: false,
  headers() {
    return Promise.resolve([{ source: "/:path*", headers: SECURITY_HEADERS }]);
  },
};

export default nextConfig;
