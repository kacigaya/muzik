import { saveLyricsEnabled } from "@/lib/settings";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { enabled?: unknown };
    return Response.json({ lyrics: await saveLyricsEnabled(body?.enabled) });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Lyrics setting is invalid.";
    return Response.json({ error: message }, { status: 400 });
  }
}
