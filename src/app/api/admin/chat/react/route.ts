import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { toggleReaction } from "@/lib/chat";

const schema = z.object({ messageId: z.string().min(1), emoji: z.string().min(1).max(8) });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const reactions = await toggleReaction(parsed.data.messageId, "ADMIN", parsed.data.emoji);
  if (reactions === null) return NextResponse.json({ error: "not allowed" }, { status: 400 });
  return NextResponse.json({ ok: true, reactions });
}
