"use client";

import { useState } from "react";
import type { PublicLidarrSettings } from "@/lib/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export function LidarrSettings({ initial }: { initial: PublicLidarrSettings }) {
  const [settings, setSettings] = useState(initial);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [url, setUrl] = useState(initial.url);
  const [apiKey, setApiKey] = useState("");
  const [musicDir, setMusicDir] = useState(initial.musicDir);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [error, setError] = useState<string | null>(initial.configurationError);
  const [message, setMessage] = useState<string | null>(null);
  const pinned = settings.enabledPinned || settings.urlPinned || settings.apiKeyPinned || settings.musicDirPinned;
  const allPinned = settings.enabledPinned && settings.urlPinned && settings.apiKeyPinned && settings.musicDirPinned;

  async function submit(action: "save" | "test") {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/settings/lidarr${action === "test" ? "/test" : ""}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, url, apiKey, musicDir }),
      });
      const data: { lidarr?: PublicLidarrSettings; message?: string; error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not configure Lidarr.");
      if (action === "save") {
        if (!data.lidarr) throw new Error("Could not read saved Lidarr settings.");
        setSettings(data.lidarr);
        setEnabled(data.lidarr.enabled);
        setUrl(data.lidarr.url);
        setMusicDir(data.lidarr.musicDir);
        setApiKey("");
        setMessage("Lidarr settings saved.");
      } else {
        setMessage(data.message ?? "Connected to Lidarr.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not configure Lidarr.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="lidarr-title" className="mb-8">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 id="lidarr-title" className="mb-1 text-sm font-medium">Lidarr</h2>
          <p className="text-xs text-muted-foreground">
            Registers finished downloads for existing artists, keeping files in place.
            Muzik shows which files Lidarr recognized and lets you retry unmatched files.
          </p>
        </div>
        {pinned && <Badge variant="secondary" size="sm">Environment override</Badge>}
      </div>
      <Card className="p-4">
        <form className="flex flex-col gap-4" aria-busy={busy !== null} aria-describedby={error ? "lidarr-error" : undefined}
          onSubmit={(event) => { event.preventDefault(); void submit("save"); }}>
          <Field name="lidarrEnabled" disabled={settings.enabledPinned || busy !== null} className="flex-row items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <FieldLabel>Register downloads automatically</FieldLabel>
              <FieldDescription>{settings.enabledPinned ? "Set by MUZIK_LIDARR_ENABLED." : "Applies to new songs, albums, and playlists."}</FieldDescription>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </Field>
          <Field name="lidarrUrl" disabled={settings.urlPinned || busy !== null}>
            <FieldLabel htmlFor="lidarr-url">Server URL</FieldLabel>
            <Input id="lidarr-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)}
              placeholder="http://lidarr:8686" required={enabled} disabled={settings.urlPinned || busy !== null} />
            <FieldDescription>{settings.urlPinned ? "Set by MUZIK_LIDARR_URL." : "Include any reverse-proxy base path, such as /lidarr."}</FieldDescription>
          </Field>
          <Field name="lidarrApiKey" disabled={settings.apiKeyPinned || busy !== null}>
            <FieldLabel htmlFor="lidarr-api-key">API key</FieldLabel>
            <Input id="lidarr-api-key" type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)}
              placeholder={settings.apiKeyConfigured ? "Saved API key" : "Enter API key"} disabled={settings.apiKeyPinned || busy !== null} />
            <FieldDescription>{settings.apiKeyPinned ? "Set by MUZIK_LIDARR_API_KEY."
              : "Find it under Lidarr Settings > General. Leave blank to keep the saved key; changing servers requires a new key."}</FieldDescription>
          </Field>
          <Field name="lidarrMusicDir" disabled={settings.musicDirPinned || busy !== null}>
            <FieldLabel htmlFor="lidarr-music-dir">Music root inside Lidarr</FieldLabel>
            <Input id="lidarr-music-dir" type="text" value={musicDir} onChange={(event) => setMusicDir(event.target.value)}
              placeholder="Same path as Muzik" disabled={settings.musicDirPinned || busy !== null} />
            <FieldDescription>{settings.musicDirPinned ? "Set by MUZIK_LIDARR_MUSIC_DIR."
              : "Optional. Both apps must share the same files. If Muzik uses /music and Lidarr uses /media/music, enter /media/music."}</FieldDescription>
          </Field>
          {error && <p id="lidarr-error" className="text-xs text-destructive-foreground" role="alert">{error}</p>}
          {message && <p className="text-xs text-success-foreground" role="status">{message}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy === "save"} disabled={busy !== null || allPinned}>Save Lidarr settings</Button>
            <Button type="button" variant="outline" loading={busy === "test"} disabled={busy !== null} onClick={() => void submit("test")}>Test connection</Button>
          </div>
          {allPinned && <p className="text-xs text-muted-foreground">All settings are managed by environment variables.</p>}
        </form>
      </Card>
    </section>
  );
}
