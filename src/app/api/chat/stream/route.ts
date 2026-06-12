import { getVisitorCookieId } from "@/lib/visitor";
import { prisma } from "@/lib/prisma";
import { subscribeVisitor } from "@/lib/chat-bus";
import { createSSEStream } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Realtime stream for a visitor: admin replies + read receipts for their thread.
// NOTE: never return 204 here — per the EventSource spec a 204 tells the browser
// to STOP reconnecting. Always return a live (keep-alive) stream; subscribe only
// once we can resolve the visitor.
export async function GET(req: Request) {
  const cookieId = await getVisitorCookieId();
  const visitor = cookieId
    ? await prisma.visitor.findUnique({ where: { cookieId } })
    : null;

  return createSSEStream(
    (send) => (visitor ? subscribeVisitor(visitor.id, send) : () => {}),
    req.signal
  );
}
