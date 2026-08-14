"use client";

import { useEffect } from "react";

/** Registers the shell cache so Muzik can be installed and opened offline. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || window.location.protocol !== "https:") return;
    const timer = window.setTimeout(() => {
      void navigator.serviceWorker.register("/sw.js").catch(() => { /* offline support stays optional */ });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}
