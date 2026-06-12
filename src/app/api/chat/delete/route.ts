import { NextResponse } from "next/server";
import { z } from "zod";
import { getVisitorCookieId } from "@/lib/visitor";
import { prisma } from "@/lib/prisma";
import { deleteMessage } from "@/lib/chat";

const schema = z.object({ messageId: z.string().min(1) });

export async function POST(req: Request) {
  const cookieId = await getVisitorCookieId();
  if (!cookieId) return NextResponse.json({ error: "no visitor" }, { status: 401 });
  const visitor = await prisma.visitor.findUnique({ where: { cookieId } });
  if (!visitor) return NextResponse.json({ error: "no visitor" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const ok = await deleteMessage(parsed.data.messageId, "VISITOR", { visitorId: visitor.id });
  if (!ok) return NextResponse.json({ error: "not allowed" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
