import { listeningCommand } from "@/lib/listening";
import { changeListeningLibrary, readListeningLibrary } from "@/lib/listening-store";

export async function GET() {
  try {
    return Response.json(await readListeningLibrary(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not read saved music. Check the server data directory." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let command;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Library action is required.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512 * 1024) { await reader.cancel(); throw new Error("Library action is too large."); }
      chunks.push(value);
    }
    command = listeningCommand(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (cause) {
    return Response.json({ error: cause instanceof SyntaxError ? "Invalid JSON." : cause instanceof Error ? cause.message : "Invalid library action." }, { status: 400 });
  }
  try {
    return Response.json(await changeListeningLibrary(command), { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    const conflict = /limit|not found/.test(message);
    return Response.json({ error: conflict ? message : "Could not save music. Check the server data directory." }, { status: conflict ? 409 : 500 });
  }
}
