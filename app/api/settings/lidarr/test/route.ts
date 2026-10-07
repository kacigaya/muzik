import { lidarrTestConnection } from "@/lib/settings";
import { testLidarrConnection } from "@/lib/lidarr";

export async function POST(request: Request) {
  try {
    return Response.json(await testLidarrConnection(await lidarrTestConnection(await request.json())));
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "Could not connect to Lidarr." }, { status: 400 });
  }
}
