import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyAdminTyping } from "@/lib/chat";

const schema = z.object({ threadId: z.string().min(1) });

// Transient "admin is typing" signal toward the visitor.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: true });

  const thread = await prisma.chatThread.findUnique({
    where: { id: parsed.data.threadId },
    select: { id: true, visitorId: true },
  });
  if (thread) notifyAdminTyping(thread.id, thread.visitorId);
  return NextResponse.json({ ok: true });
}
