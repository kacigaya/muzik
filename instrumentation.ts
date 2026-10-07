export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // register() also runs while building, where queueing downloads would be surprising.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startScheduler, syncDue } = await import("./lib/subscriptions.ts");
  startScheduler();
  // Catch up on anything that came due while the server was down.
  void syncDue();
}
