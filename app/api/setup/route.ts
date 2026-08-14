import { musicDir, pinnedByEnvironment, saveMusicDir } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { musicDir: await musicDir(), pinned: pinnedByEnvironment() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  // Muzik has no accounts, so the folder can only be chosen while none is set.
  // Changing it later means editing settings.json or setting MUZIK_MUSIC_DIR.
  if (await musicDir()) {
    return Response.json({ error: "A music folder is already configured." }, { status: 409 });
  }
  try {
    const body = await request.json();
    return Response.json({ musicDir: await saveMusicDir((body as { musicDir?: unknown }).musicDir) }, { status: 201 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Music folder is invalid.";
    const denied = (cause as NodeJS.ErrnoException).code === "EACCES" || (cause as NodeJS.ErrnoException).code === "EPERM";
    return Response.json(
      { error: denied ? "Muzik is not allowed to create that folder." : message },
      { status: 400 },
    );
  }
}
