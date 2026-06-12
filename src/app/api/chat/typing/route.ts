import { NextResponse } from "next/server";
import { getVisitorCookieId } from "@/lib/visitor";
import { prisma } from "@/lib/prisma";
import { notifyVisitorTyping } from "@/lib/chat";

// Transient "visitor is typing" signal. No-op until a thread exists.
export async function POST() {
  const cookieId = await getVisitorCookieId();
  if (!cookieId) return NextResponse.json({ ok: true });
  const visitor = await prisma.visitor.findUnique({
    where: { cookieId },
    include: { thread: { select: { id: true } } },
  });
  if (visitor?.thread) notifyVisitorTyping(visitor.id, visitor.thread.id);
  return NextResponse.json({ ok: true });
}
