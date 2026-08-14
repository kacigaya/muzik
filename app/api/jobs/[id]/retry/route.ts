import { jobStore } from "@/lib/jobs";
import { validateJobId } from "@/lib/validation";

export async function POST(_request: Request, context: RouteContext<"/api/jobs/[id]/retry">) {
  try {
    const { id } = await context.params;
    return Response.json({ job: await jobStore.retry(validateJobId(id)) });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Retry failed.";
    return Response.json({ error: message }, { status: message === "Job not found." ? 404 : 400 });
  }
}
