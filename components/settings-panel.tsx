"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { AUDIO_FORMATS, type AudioFormat } from "@/lib/types";
import type { PublicNavidromeSettings } from "@/lib/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const RADIO_STEP: Record<string, number> = { ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1 };

/**
 * Keeps the arrow-key behaviour the radiogroup role promises: focus moves between the
 * buttons, wraps around, and takes the selection with it.
 */
function moveRadioFocus(event: React.KeyboardEvent<HTMLDivElement>) {
  const step = RADIO_STEP[event.key];
  if (step === undefined && event.key !== "Home" && event.key !== "End") return;
  const radios = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)'));
  const current = radios.findIndex((radio) => radio === document.activeElement);
  if (current < 0) return;
  event.preventDefault();
  let index = (current + (step ?? 0) + radios.length) % radios.length;
  if (event.key === "Home") index = 0;
  if (event.key === "End") index = radios.length - 1;
  radios[index].focus();
  radios[index].click();
}

const FORMAT_NOTE: Record<AudioFormat, string> = {
  m4a: "Kept as downloaded, no re-encoding",
  opus: "Smallest files at the same quality",
  lossless: "Qobuz FLAC when authorized; otherwise native AAC or Opus",
  flac: "Transcoded from lossy YouTube audio; not lossless",
  mp3: "Widest player support",
};

export function SettingsPanel({
  musicDir,
  pinned,
  navidrome: initialNavidrome,
}: {
  musicDir: string;
  pinned: boolean;
  navidrome: PublicNavidromeSettings;
}) {
  const router = useRouter();
  const [format, setFormat] = useState<AudioFormat>(AUDIO_FORMATS[0]);
  const [navidrome, setNavidrome] = useState(initialNavidrome);
  const [navidromeUrl, setNavidromeUrl] = useState(initialNavidrome.url);
  const [authMode, setAuthMode] = useState(initialNavidrome.authMode);
  const [apiKey, setApiKey] = useState("");
  const [username, setUsername] = useState(initialNavidrome.username);
  const [password, setPassword] = useState("");
  const [savingNavidrome, setSavingNavidrome] = useState(false);
  const [navidromeMessage, setNavidromeMessage] = useState<string | null>(null);
  const [navidromeError, setNavidromeError] = useState<string | null>(null);

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

  async function updateNavidrome(clearAuth = false) {
    setSavingNavidrome(true);
    setNavidromeError(null);
    setNavidromeMessage(null);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: navidromeUrl, authMode, apiKey, username, password, clearAuth }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save Navidrome settings.");
      setNavidrome(data.navidrome as PublicNavidromeSettings);
      setNavidromeUrl(data.navidrome.url);
      setAuthMode(data.navidrome.authMode);
      setUsername(data.navidrome.username);
      setApiKey("");
      setPassword("");
      setNavidromeMessage(clearAuth ? "Navidrome credentials removed." : "Navidrome settings saved.");
      // The nav bar renders the server-supplied URL, so it only learns about a new server
      // once the surrounding server component re-renders.
      router.refresh();
    } catch (cause) {
      setNavidromeError(cause instanceof Error ? cause.message : "Could not save Navidrome settings.");
    } finally {
      setSavingNavidrome(false);
    }
  }

  async function saveNavidrome(event: React.FormEvent) {
    event.preventDefault();
    await updateNavidrome();
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
        <div
          aria-labelledby="format-title"
          className="grid grid-cols-2 gap-2 sm:grid-cols-5"
          onKeyDown={moveRadioFocus}
          role="radiogroup"
        >
          {AUDIO_FORMATS.map((option) => (
            <Button
              aria-checked={option === format}
              className={`w-full justify-between font-mono uppercase ${option === format ? "border-brand" : ""}`}
              key={option}
              onClick={() => choose(option)}
              role="radio"
              tabIndex={option === format ? 0 : -1}
              variant="outline"
            >
              {option}
              {option === format && <Check aria-hidden="true" className="text-brand opacity-100" />}
            </Button>
          ))}
        </div>
        {/* Only the chosen format keeps its note so the buttons stay the height of the other controls. */}
        <p className="mt-2 text-xs text-muted-foreground">{FORMAT_NOTE[format]}</p>
      </section>

      <section aria-labelledby="navidrome-title" className="mb-8">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 className="mb-1 text-sm font-medium" id="navidrome-title">Navidrome</h2>
            <p className="text-xs text-muted-foreground">
              Shows library links and requests a quick scan after each successful download.
            </p>
          </div>
          {(navidrome.urlPinned || navidrome.authPinned) && <Badge variant="secondary" size="sm">Environment override</Badge>}
        </div>
        <Card className="p-4">
          <form className="flex flex-col gap-4" onSubmit={saveNavidrome}>
            <Field name="navidromeUrl">
              <FieldLabel htmlFor="navidrome-url">Server URL</FieldLabel>
              <Input
                id="navidrome-url"
                type="url"
                value={navidromeUrl}
                onChange={(event) => setNavidromeUrl(event.target.value)}
                placeholder="https://music.example.com"
                autoComplete="url"
                spellCheck={false}
                required
                disabled={navidrome.urlPinned}
                className="*:data-[slot=input]:font-mono"
              />
              <FieldDescription>
                Base URL only. Credentials, query strings, and fragments are rejected.
              </FieldDescription>
            </Field>

            <fieldset className="flex flex-col gap-3" disabled={navidrome.authPinned}>
              <legend className="mb-2 text-sm font-medium">API authentication</legend>
              <div
                aria-label="Navidrome authentication method"
                className="grid gap-2 sm:grid-cols-2"
                onKeyDown={moveRadioFocus}
                role="radiogroup"
              >
                {(["apiKey", "password"] as const).map((mode) => (
                  <Button
                    aria-checked={authMode === mode}
                    className={`w-full justify-between ${authMode === mode ? "border-brand" : ""}`}
                    key={mode}
                    onClick={() => setAuthMode(mode)}
                    role="radio"
                    tabIndex={authMode === mode ? 0 : -1}
                    variant="outline"
                  >
                    {mode === "apiKey" ? "API key" : "Username and password"}
                    {authMode === mode && <Check aria-hidden="true" className="text-brand opacity-100" />}
                  </Button>
                ))}
              </div>

              {authMode === "apiKey" ? (
                <Field name="navidromeApiKey">
                  <FieldLabel htmlFor="navidrome-api-key">API key</FieldLabel>
                  <Input
                    id="navidrome-api-key"
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={navidrome.apiKeyConfigured ? "Saved API key" : "Enter API key"}
                    autoComplete="new-password"
                    spellCheck={false}
                  />
                  {navidrome.apiKeyConfigured && <FieldDescription>Leave blank to keep the saved key.</FieldDescription>}
                </Field>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field name="navidromeUsername">
                    <FieldLabel htmlFor="navidrome-username">Username</FieldLabel>
                    <Input
                      id="navidrome-username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      autoComplete="username"
                      spellCheck={false}
                    />
                  </Field>
                  <Field name="navidromePassword">
                    <FieldLabel htmlFor="navidrome-password">Password</FieldLabel>
                    <Input
                      id="navidrome-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={navidrome.passwordConfigured ? "Saved password" : "Enter password"}
                      autoComplete="current-password"
                    />
                    {navidrome.passwordConfigured && <FieldDescription>Leave blank to keep the saved password.</FieldDescription>}
                  </Field>
                </div>
              )}
            </fieldset>

            {navidromeError && <p className="text-xs text-destructive-foreground" role="alert">{navidromeError}</p>}
            {navidromeMessage && <p className="text-xs text-success-foreground" role="status">{navidromeMessage}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" loading={savingNavidrome} disabled={navidrome.urlPinned && navidrome.authPinned}>
                Save Navidrome settings
              </Button>
              {!navidrome.authPinned && (navidrome.apiKeyConfigured || navidrome.passwordConfigured) && (
                <Button type="button" variant="ghost" disabled={savingNavidrome} onClick={() => updateNavidrome(true)}>
                  Remove saved credentials
                </Button>
              )}
            </div>
          </form>
        </Card>
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
