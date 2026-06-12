import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Thread list for the admin chat console (most recent first).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const threads = await prisma.chatThread.findMany({
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: {
      visitor: { select: { id: true, name: true, contact: true, _count: { select: { leads: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return NextResponse.json({
    threads: threads.map((t) => {
      const last = t.messages[0];
      return {
        id: t.id,
        visitorId: t.visitorId,
        unread: t.adminUnread,
        lastMessageAt: t.lastMessageAt.toISOString(),
        lastBody: last?.body ?? "",
        lastSender: last?.sender ?? null,
        visitorName: t.visitor.name,
        visitorContact: t.visitor.contact,
        leadsCount: t.visitor._count.leads,
      };
    }),
  });
}
