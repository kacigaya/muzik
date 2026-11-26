import type { Metadata } from "next";
import { Suspense } from "react";
import { CollectionSkeleton, CollectionView } from "@/components/collection-view";
import { publicLidarrSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Album · Muzik", description: "Tracks of a YouTube Music album or playlist." };

async function Collection() {
  const lidarr = await publicLidarrSettings();
  return <CollectionView lidarrEnabled={lidarr.enabled && Boolean(lidarr.url) && lidarr.apiKeyConfigured} />;
}

export default function CollectionPage() {
  return <Suspense fallback={<CollectionSkeleton />}><Collection /></Suspense>;
}
