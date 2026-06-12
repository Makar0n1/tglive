import { NextResponse } from "next/server";
import { z } from "zod";
import { getVisitorCookieId } from "@/lib/visitor";
import { prisma } from "@/lib/prisma";
import { toggleReaction } from "@/lib/chat";

const schema = z.object({ messageId: z.string().min(1), emoji: z.string().min(1).max(8) });

export async function POST(req: Request) {
  const cookieId = await getVisitorCookieId();
  if (!cookieId) return NextResponse.json({ error: "no visitor" }, { status: 401 });
  const visitor = await prisma.visitor.findUnique({ where: { cookieId } });
  if (!visitor) return NextResponse.json({ error: "no visitor" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const reactions = await toggleReaction(parsed.data.messageId, "VISITOR", parsed.data.emoji, {
    visitorId: visitor.id,
  });
  if (reactions === null) return NextResponse.json({ error: "not allowed" }, { status: 400 });
  return NextResponse.json({ ok: true, reactions });
}
