"use client";

import { useEffect } from "react";

/** Registers the (cache-free) worker that keeps Muzik installable as a PWA. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || window.location.protocol !== "https:") return;
    const timer = window.setTimeout(() => {
      void navigator.serviceWorker.register("/sw.js").catch(() => { /* PWA install stays optional */ });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}
