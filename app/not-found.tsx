import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Music2 } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found | Muzik",
  description: "The requested Muzik page could not be found.",
};

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav navidromeUrl="" />
      <main className="flex flex-1 items-center px-4 py-14 sm:py-20">
        <section className="mx-auto flex w-full max-w-md flex-col items-center text-center" aria-labelledby="not-found-title">
          <span className="font-mono text-sm text-muted-foreground tabular-nums">404</span>
          <Music2 aria-hidden="true" className="mt-5 size-8 text-muted-foreground" />
          <h1 id="not-found-title" className="mt-4 font-heading text-3xl font-bold text-balance sm:text-4xl">
            This page missed the beat
          </h1>
          <p className="mt-3 max-w-sm text-pretty text-sm text-muted-foreground sm:text-base">
            The address may be wrong, or the page may have moved.
          </p>
          <Button className="mt-8" render={<Link href="/" />}>
            <ArrowLeft aria-hidden="true" /> Back to search
          </Button>
        </section>
      </main>
    </div>
  );
}
