import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseAttachments } from "@/lib/chat";

export const dynamic = "force-dynamic";

// Full conversation + the linked person's identity and their leads, so the
// admin sees that a chat and a form submission are the same human.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const threadId = new URL(req.url).searchParams.get("threadId");
  if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });

  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 500,
        include: { replyTo: { select: { id: true, body: true, sender: true } } },
      },
      visitor: {
        include: {
          leads: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!thread) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    thread: {
      id: thread.id,
      visitorId: thread.visitorId,
      // For admin read receipts: when the visitor last read admin messages.
      visitorReadAt: thread.visitorReadAt ? thread.visitorReadAt.toISOString() : null,
      adminReadAt: thread.adminReadAt ? thread.adminReadAt.toISOString() : null,
    },
    visitor: {
      id: thread.visitor.id,
      name: thread.visitor.name,
      contact: thread.visitor.contact,
      ip: thread.visitor.ip,
      createdAt: thread.visitor.createdAt.toISOString(),
    },
    leads: thread.visitor.leads.map((l) => ({
      id: l.id,
      message: l.message,
      contact: l.contact,
      status: l.status,
      createdAt: l.createdAt.toISOString(),
    })),
    messages: thread.messages.map((m) => ({
      id: m.id,
      sender: m.sender,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      attachments: parseAttachments(m.attachments),
      reactions: Array.isArray(m.reactions) ? m.reactions : [],
      replyTo: m.replyTo ? { id: m.replyTo.id, body: m.replyTo.body, sender: m.replyTo.sender } : null,
    })),
  });
}
