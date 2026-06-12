import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { processChatUpload } from "@/lib/chat-upload";

// Admin chat attachment upload. One file per request.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
  }

  const res = await processChatUpload(file);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ attachment: res.attachment });
}
