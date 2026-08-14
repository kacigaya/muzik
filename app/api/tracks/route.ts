import { listTracks } from "@/lib/tracks";
import { PLAYLIST_ID } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const sourceId = params.get("id") ?? "";
  if (kind !== "album" && kind !== "playlist") {
    return Response.json({ error: "Only albums and playlists have tracks." }, { status: 400 });
  }
  if (!PLAYLIST_ID.test(sourceId)) {
    return Response.json({ error: "Source ID is invalid." }, { status: 400 });
  }
  try {
    return Response.json({ items: await listTracks(kind, sourceId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Track listing failed.";
    const timeout = /timeout|timed out/i.test(message);
    return Response.json(
      { error: timeout ? "Loading the track list timed out." : "Could not load the track list." },
      { status: timeout ? 504 : 502 },
    );
  }
}
