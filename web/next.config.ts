import path from "node:path";
import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  // The app lives in the repo root and has its own lockfile and proxy.ts, so pin the
  // root here instead of letting Turbopack walk up and pick the parent project.
  turbopack: { root: path.resolve(import.meta.dirname) },
};

export default nextConfig;
