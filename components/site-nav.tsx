"use client";

import Link from "next/link";
import { useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Music2 } from "lucide-react";
import { Moon, Sun } from "lucide";
import { MorphIcon } from "morphicons/react";
import { Disc3Icon, type Disc3IconHandle } from "@/components/icons/disc-3";
import { GalleryVerticalEndIcon } from "@/components/icons/gallery-vertical-end";
import { SettingsIcon } from "@/components/icons/settings";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/library", label: "Browse the library", icon: GalleryVerticalEndIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

const subscribeToHydration = () => () => {};

/** Shared by search, library, and settings so the same controls stay reachable on every page. */
export function SiteNav({ navidromeUrl, logoHref = "/" }: { navidromeUrl: string; logoHref?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const discIcon = useRef<Disc3IconHandle>(null);
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);

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
            <MorphIcon
              icon={hydrated && resolvedTheme ? (resolvedTheme === "dark" ? Moon : Sun) : undefined}
              spring="snappy"
            />
          </Button>
          {navidromeUrl && (
            <Button
              variant="outline"
              className="max-sm:px-2"
              render={<a href={navidromeUrl} target="_blank" rel="noreferrer" />}
              onMouseEnter={() => discIcon.current?.startAnimation()}
              onMouseLeave={() => discIcon.current?.stopAnimation()}
            >
              {/* Below ~380px the label is dropped so the bar can never overflow. */}
              <span className="max-[380px]:sr-only">Navidrome</span>
              {/* The label makes the button wider than the glyph, so hover is driven from here. */}
              <Disc3Icon ref={discIcon} />
            </Button>
          )}
        </div>
      </nav>
    </header>
  );
}
