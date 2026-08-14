import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Muzik",
    short_name: "Muzik",
    description: "Search YouTube Music and save songs, albums, and playlists to your own library.",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#161616",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
