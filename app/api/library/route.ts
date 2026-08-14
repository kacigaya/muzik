import { deletionAllowed, listLibrary, removeFromLibrary } from "@/lib/library";
import { validateLibraryPath } from "@/lib/validation";

export const dynamic = "force-dynamic";

function failure(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Library request failed.";
  const code = (cause as NodeJS.ErrnoException).code;
  if (code === "ENOENT") return Response.json({ error: "That folder no longer exists." }, { status: 404 });
  const forbidden = message.includes("disabled") || message.includes("outside") || message.includes("root cannot");
  return Response.json({ error: message }, { status: forbidden ? 403 : 400 });
}

export async function GET(request: Request) {
  try {
    const path = validateLibraryPath(new URL(request.url).searchParams.get("path"));
    const listing = await listLibrary(path);
    return Response.json(
      { ...listing, canDelete: deletionAllowed() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    return failure(cause);
  }
}

export async function DELETE(request: Request) {
  try {
    const path = validateLibraryPath(new URL(request.url).searchParams.get("path"));
    return Response.json(await removeFromLibrary(path));
  } catch (cause) {
    return failure(cause);
  }
}
