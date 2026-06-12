import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { deleteMessage } from "@/lib/chat";

const schema = z.object({ messageId: z.string().min(1) });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const ok = await deleteMessage(parsed.data.messageId, "ADMIN");
  if (!ok) return NextResponse.json({ error: "not allowed" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
