import { jobStore } from "@/lib/jobs";
import { validateJobId } from "@/lib/validation";

export async function POST(_request: Request, context: RouteContext<"/api/jobs/[id]/lidarr/retry">) {
  try {
    const { id } = await context.params;
    return Response.json({ job: await jobStore.retryLidarr(validateJobId(id)) }, { status: 202 });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "Lidarr retry failed.";
    return Response.json({ error }, { status: error === "Job not found." ? 404 : 400 });
  }
}
