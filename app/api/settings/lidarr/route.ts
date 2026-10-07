import { publicLidarrSettings, saveLidarrSettings } from "@/lib/settings";

export async function GET() {
  return Response.json({ lidarr: await publicLidarrSettings() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    return Response.json({ lidarr: await saveLidarrSettings(await request.json()) });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "Lidarr settings are invalid." }, { status: 400 });
  }
}
