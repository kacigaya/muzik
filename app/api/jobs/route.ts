import { jobStore } from "@/lib/jobs";
import { validateJobRequest } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ jobs: await jobStore.list() }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  return Response.json({ jobs: await jobStore.clearFinished() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const body = validateJobRequest(await request.json());
    const result = await jobStore.create(body);
    return Response.json(result, { status: result.created ? 202 : 200 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Invalid request.";
    return Response.json({ error: message }, { status: 400 });
  }
}
