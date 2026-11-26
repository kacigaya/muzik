import type { Metadata } from "next";
import { Suspense } from "react";
import { SavedMusic, SavedSkeleton } from "@/components/saved-music";

export const metadata: Metadata = { title: "Saved music · Muzik", description: "Your liked YouTube Music songs and playlists." };

export default function SavedPage() {
  return <Suspense fallback={<SavedSkeleton />}><SavedMusic /></Suspense>;
}
