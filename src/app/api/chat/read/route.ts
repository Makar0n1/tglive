import { NextResponse } from "next/server";
import { getVisitorCookieId } from "@/lib/visitor";
import { prisma } from "@/lib/prisma";
import { markVisitorRead } from "@/lib/chat";

export async function POST() {
  const cookieId = await getVisitorCookieId();
  if (!cookieId) return NextResponse.json({ ok: true });
  const visitor = await prisma.visitor.findUnique({ where: { cookieId } });
  if (visitor) await markVisitorRead(visitor.id);
  return NextResponse.json({ ok: true });
}
