import { externalLink, parseMusicLink } from "@/lib/link";
import { resolveExternal, resolveLink } from "@/lib/resolve";
import { validateLinkUrl } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = validateLinkUrl(new URL(request.url).searchParams.get("url"));
    const external = externalLink(url);
    const parsed = external ? null : parseMusicLink(url);
    if (!external && !parsed) {
      return Response.json({ error: "Not a supported music link." }, { status: 400 });
    }
    const items = external ? await resolveExternal(external) : await resolveLink(parsed!);
    return Response.json({ url, items }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Resolve failed.";
    const invalid = message.includes("Link URL");
    const timeout = /timeout|timed out/i.test(message);
    return Response.json(
      { error: invalid ? message : timeout ? "Resolving the link timed out." : "Could not resolve this link." },
      { status: invalid ? 400 : timeout ? 504 : 502 },
    );
  }
}
