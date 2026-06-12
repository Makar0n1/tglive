import { NextResponse } from "next/server";
import { getVisitorCookieId } from "@/lib/visitor";
import { prisma } from "@/lib/prisma";
import { getVisitorState } from "@/lib/chat";

export const dynamic = "force-dynamic";

// Returns the current visitor's conversation + unread count. No cookie yet =>
// empty state (a thread is created lazily on first message).
export async function GET() {
  const cookieId = await getVisitorCookieId();
  if (!cookieId) return NextResponse.json({ messages: [], unread: 0, hasVisitor: false });

  const visitor = await prisma.visitor.findUnique({ where: { cookieId } });
  if (!visitor) return NextResponse.json({ messages: [], unread: 0, hasVisitor: false });

  const state = await getVisitorState(visitor.id);
  return NextResponse.json({ ...state, hasVisitor: true });
}
