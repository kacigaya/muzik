import { requestLidarrAlbum } from "@/lib/lidarr";
import { validateLidarrRequest } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const { artist, album } = validateLidarrRequest(await request.json());
    return Response.json(await requestLidarrAlbum(artist, album), { status: 202 });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "Lidarr request failed." }, { status: 400 });
  }
}
