import type { ChatEvent } from "./chat-bus";

// Builds a Server-Sent Events Response. `register` receives a `send` function
// and returns an unsubscribe callback. Keep-alive comments prevent idle proxies
// from closing the connection.
export function createSSEStream(
  register: (send: (event: ChatEvent) => void) => () => void,
  signal: AbortSignal
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          /* controller already closed */
        }
      };

      const send = (event: ChatEvent) => {
        safeEnqueue(`data: ${JSON.stringify(event)}\n\n`);
      };

      // Initial comment so the client's onopen fires promptly.
      safeEnqueue(`: connected\n\n`);

      const unsubscribe = register(send);
      const ping = setInterval(() => safeEnqueue(`: ping\n\n`), 25000);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* noop */
        }
      };

      signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering for SSE
    },
  });
}
