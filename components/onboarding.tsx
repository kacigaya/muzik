"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function Onboarding({ suggestion }: { suggestion: string }) {
  const [path, setPath] = useState(suggestion);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ musicDir: path }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save the music folder.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the music folder.");
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-14">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <Music2 aria-hidden="true" className="mx-auto mb-4 size-8" />
          <h1 className="font-heading text-3xl font-bold text-balance sm:text-4xl">Welcome to Muzik</h1>
          <p className="mx-auto mt-3 max-w-md text-pretty text-sm text-muted-foreground">
            Pick the folder your downloads should land in. Point it at the library your music
            server already reads.
          </p>
        </div>
        <Card className="p-5">
          <form onSubmit={save} className="flex flex-col gap-4">
            <Field name="musicDir">
              <FieldLabel htmlFor="music-dir">Music folder</FieldLabel>
              <Input
                id="music-dir"
                value={path}
                onChange={(event) => setPath(event.target.value)}
                placeholder="/music"
                autoFocus
                spellCheck={false}
                autoComplete="off"
                size="lg"
                className="w-full *:data-[slot=input]:font-mono"
                aria-describedby={error ? "setup-error" : "setup-hint"}
                aria-invalid={error ? true : undefined}
              />
              <FieldDescription id="setup-hint">
                An absolute path on the machine running Muzik. It is created if it does not
                exist yet, and tracks are written as <code className="font-mono">Artist/Album/Track</code>.
              </FieldDescription>
            </Field>
            {error && (
              <p className="text-xs text-destructive-foreground" id="setup-error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" loading={saving} disabled={!path.trim()} className="w-full">
              Start using Muzik
            </Button>
          </form>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Set <code className="font-mono">MUZIK_MUSIC_DIR</code> to skip this screen entirely.
        </p>
      </div>
    </div>
  );
}
