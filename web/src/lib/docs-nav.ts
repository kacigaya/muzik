interface NavItem {
  title: string;
  href: string;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  { items: [{ title: "Overview", href: "/docs" }] },
  {
    title: "Getting Started",
    items: [
      { title: "Install", href: "/docs/getting-started/install" },
      { title: "Deploy", href: "/docs/getting-started/deploy" },
    ],
  },
  {
    title: "Using Muzik",
    items: [
      { title: "Downloads", href: "/docs/guide/downloads" },
      { title: "Audio Formats", href: "/docs/guide/audio-formats" },
      { title: "Qobuz Lossless", href: "/docs/guide/qobuz-lossless" },
      { title: "Library and Metadata", href: "/docs/guide/library" },
      { title: "Navidrome and Lyrics", href: "/docs/guide/navidrome-lyrics" },
    ],
  },
  {
    title: "Reference",
    items: [
      { title: "Configuration", href: "/docs/reference/configuration" },
      { title: "Security", href: "/docs/reference/security" },
      { title: "Development", href: "/docs/reference/development" },
    ],
  },
];

// Every markdown doc slug derived from the nav (["/docs"] -> []).
export function getDocSlugs(): string[][] {
  return NAV.flatMap((section) =>
    section.items.map((item) =>
      item.href.replace(/^\/docs\/?/, "").split("/").filter(Boolean),
    ),
  );
}
