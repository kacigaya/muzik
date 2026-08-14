"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { AUDIO_FORMATS, type AudioFormat } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const FORMAT_NOTE: Record<AudioFormat, string> = {
  m4a: "Kept as downloaded, no re-encoding",
  opus: "Smallest files at the same quality",
  flac: "Lossless, from a lossy source",
  mp3: "Widest player support",
};

export function SettingsPanel({ musicDir, pinned }: { musicDir: string; pinned: boolean }) {
  const [format, setFormat] = useState<AudioFormat>(AUDIO_FORMATS[0]);

  // The choice only exists in the browser, so it is applied after mount rather than
  // during render, where it would not match the server markup.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem("muzik-format") as AudioFormat | null;
      if (stored && AUDIO_FORMATS.includes(stored)) setFormat(stored);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function choose(value: AudioFormat) {
    setFormat(value);
    window.localStorage.setItem("muzik-format", value);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-8">
      <div className="mb-8 flex min-h-9 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon-sm" render={<Link href="/" />} aria-label="Back to search">
            <ArrowLeft aria-hidden="true" />
          </Button>
          <h1 className="min-w-0 truncate font-heading text-xl font-semibold">Settings</h1>
        </div>
      </div>

      <section aria-labelledby="format-title" className="mb-8">
        <h2 className="mb-1 text-sm font-medium" id="format-title">Audio format</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Applies to downloads you start from this browser. Anything already queued keeps the
          format it was added with.
        </p>
        <div aria-labelledby="format-title" className="grid gap-2 sm:grid-cols-2" role="radiogroup">
          {AUDIO_FORMATS.map((option) => (
            <Card
              className={`min-w-0 cursor-pointer flex-row items-center gap-3 p-3 ${option === format ? "border-brand" : ""}`}
              key={option}
              render={
                <button type="button" onClick={() => choose(option)} role="radio" aria-checked={option === format} />
              }
            >
              <span className="flex min-w-0 flex-1 flex-col text-start">
                <span className="font-mono text-sm uppercase">{option}</span>
                <span className="truncate text-xs text-muted-foreground">{FORMAT_NOTE[option]}</span>
              </span>
              {option === format && <Check aria-hidden="true" className="size-4 shrink-0 text-brand" />}
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="library-title">
        <h2 className="mb-1 text-sm font-medium" id="library-title">Music folder</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Where finished downloads are written. Changing it means editing the server
          configuration, not this page.
        </p>
        <Card className="flex-row items-center gap-3 p-3">
          <code className="min-w-0 flex-1 truncate font-mono text-xs">{musicDir}</code>
          <Badge variant="secondary" size="sm">{pinned ? "From the environment" : "Chosen at setup"}</Badge>
        </Card>
      </section>
    </div>
  );
}
