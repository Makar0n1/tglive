import { getCurrentUser } from "@/lib/auth";
import { subscribeAdmin } from "@/lib/chat-bus";
import { createSSEStream } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Realtime stream for the admin: all incoming visitor messages + read receipts.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  return createSSEStream((send) => subscribeAdmin(send), req.signal);
}
