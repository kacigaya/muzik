import { searchMusic } from "@/lib/search";
import { validateQuery } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const query = validateQuery(new URL(request.url).searchParams.get("q"));
    const results = await searchMusic(query);
    return Response.json(results, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Search failed.";
    const invalid = message.includes("query");
    const timeout = /timeout|timed out/i.test(message);
    return Response.json(
      { error: invalid ? message : timeout ? "YouTube Music search timed out." : "YouTube Music search failed." },
      { status: invalid ? 400 : timeout ? 504 : 502 },
    );
  }
}
