import { NextResponse } from "next/server";
import { resolveVisitor } from "@/lib/visitor";
import { getVisitorState } from "@/lib/chat";
import { getClientIp, getUserAgent } from "@/lib/request";

export const dynamic = "force-dynamic";

// Guarantees a visitor identity (sets the cookie) so the SSE stream can attach.
// Called when the chat panel is first opened, before connecting the stream.
export async function POST() {
  const visitor = await resolveVisitor({
    ip: await getClientIp(),
    userAgent: await getUserAgent(),
  });
  const state = await getVisitorState(visitor.id);
  return NextResponse.json({ ...state, hasVisitor: true });
}
