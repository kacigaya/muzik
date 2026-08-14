import type { DownloadJob, JobStatus } from "./types.ts";

export function newlyCompleted(previous: Map<string, JobStatus> | null, jobs: DownloadJob[]) {
  if (!previous) return [];
  const completed = new Set<JobStatus>(["completed", "completed_with_warnings"]);
  return jobs.filter((job) => previous.has(job.id) && !completed.has(previous.get(job.id)!) && completed.has(job.status));
}
