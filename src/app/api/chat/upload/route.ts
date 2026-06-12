import { NextResponse } from "next/server";
import { getVisitorCookieId } from "@/lib/visitor";
import { processChatUpload } from "@/lib/chat-upload";
import { getClientIp } from "@/lib/request";
import { rateLimit, sweep } from "@/lib/ratelimit";

// Guest chat attachment upload. One file per request (so the client can show
// per-file progress). Requires an existing visitor cookie.
export async function POST(req: Request) {
  sweep();
  const cookieId = await getVisitorCookieId();
  if (!cookieId) return NextResponse.json({ error: "Нет сессии" }, { status: 401 });

  const ip = await getClientIp();
  const rl = rateLimit(`chat-upload:${ip ?? "unknown"}`, { limit: 40, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: "Слишком быстро" }, { status: 429 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
  }

  const res = await processChatUpload(file);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ attachment: res.attachment });
}
