import { publicNavidromeSettings, saveNavidromeSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ navidrome: await publicNavidromeSettings() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    return Response.json({ navidrome: await saveNavidromeSettings(await request.json()) });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Navidrome settings are invalid.";
    return Response.json({ error: message }, { status: 400 });
  }
}
