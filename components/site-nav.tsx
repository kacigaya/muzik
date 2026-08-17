"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { ExternalLink, Music2 } from "lucide-react";
import { Moon, Sun } from "lucide";
import { MorphIcon } from "morphicons/react";
import { AudioLinesIcon } from "@/components/icons/audio-lines";
import { SettingsIcon } from "@/components/icons/settings";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/library", label: "Browse the library", icon: AudioLinesIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

/** Shared by search, library, and settings so the same controls stay reachable on every page. */
export function SiteNav({ navidromeUrl, logoHref = "/" }: { navidromeUrl: string; logoHref?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();

  return (
    <header className="px-4 pt-2 sm:px-8">
      <nav aria-label="Primary navigation" className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between gap-2 rounded-xl border bg-card/80 pl-3 pr-1.5 shadow-sm backdrop-blur sm:pl-4 sm:pr-2">
        <Link
          className="flex min-w-0 items-center gap-2.5 rounded-md text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          href={logoHref}
        >
          <Music2 aria-hidden="true" className="size-5 shrink-0" />
          <span className="truncate">Muzik</span>
        </Link>
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const current = pathname === href;
            return (
              <Button
                key={href}
                variant={current ? "secondary" : "ghost"}
                size="icon"
                render={<Link href={href} />}
                aria-label={label}
                aria-current={current ? "page" : undefined}
              >
                {/* Fills the button so the hover animation starts from anywhere inside it. */}
                <Icon className="size-full" />
              </Button>
            );
          })}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
          >
            {/* resolvedTheme is undefined until next-themes hydrates; morphicons paints the first icon without animating */}
            <MorphIcon icon={resolvedTheme ? (resolvedTheme === "dark" ? Moon : Sun) : undefined} spring="snappy" />
          </Button>
          {navidromeUrl && (
            <Button
              variant="outline"
              className="max-sm:px-2"
              render={<a href={navidromeUrl} target="_blank" rel="noreferrer" />}
            >
              {/* Below ~380px the label is dropped so the bar can never overflow. */}
              <span className="max-[380px]:sr-only">Navidrome</span>
              <ExternalLink aria-hidden="true" />
            </Button>
          )}
        </div>
      </nav>
    </header>
  );
}
