import { addSubscription, listSubscriptions, removeSubscription, syncDue } from "@/lib/subscriptions";
import { validateJobId, validateSubscription } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ subscriptions: await listSubscriptions() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const result = await addSubscription(validateSubscription(await request.json()));
    // A new subscription downloads immediately instead of waiting for the first tick.
    if (result.created) void syncDue();
    return Response.json(result, { status: result.created ? 201 : 200 });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "Invalid request." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = validateJobId(new URL(request.url).searchParams.get("id") ?? "");
    return Response.json({ subscriptions: await removeSubscription(id) });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Could not remove the subscription.";
    return Response.json({ error: message }, { status: message === "Subscription not found." ? 404 : 400 });
  }
}
