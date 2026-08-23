import { jobStore } from "@/lib/jobs";

/** Pushes the queue on every change so the UI does not have to poll while downloading. */
export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let unsubscribe = () => {};

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = async () => {
        if (closed) return;
        try {
          const jobs = await jobStore.list();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ jobs })}\n\n`));
        } catch {
          closed = true;
        }
      };
      unsubscribe = jobStore.subscribe(() => { void send(); });
      // Comment lines keep proxies from closing an idle connection.
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 25_000);
      heartbeat.unref();
      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      });
      await send();
    },
    cancel() {
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
