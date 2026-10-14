import path from "node:path";
import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  // Pin Turbopack to this project so it does not select the parent app's lockfile and proxy.
  turbopack: { root: path.resolve(import.meta.dirname) },
};

export default nextConfig;
