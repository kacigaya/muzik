import { Suspense } from "react";
import { MuzikApp } from "@/components/muzik-app";
import { Skeleton } from "@/components/ui/skeleton";
import { musicDir, publicLidarrSettings } from "@/lib/settings";

async function Home() {
  const [lidarr, library] = await Promise.all([publicLidarrSettings(), musicDir()]);
  return <MuzikApp lidarrEnabled={lidarr.enabled && Boolean(lidarr.url) && lidarr.apiKeyConfigured} downloadsConfigured={Boolean(library)} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-5"><Skeleton className="h-40 w-full rounded-xl" /></div>}>
      <Home />
    </Suspense>
  );
}
