import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { postAdminMessage, parseAttachments, MAX_BODY, MAX_ATTACHMENTS } from "@/lib/chat";
import { sanitizeChatBody } from "@/lib/chat-text";

const attachmentSchema = z.object({
  type: z.enum(["image", "file"]),
  url: z.string().max(500).refine((u) => u.startsWith("/"), "bad url"),
  name: z.string().max(300),
  size: z.number().int().nonnegative(),
  mime: z.string().max(150),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const schema = z.object({
  threadId: z.string().min(1),
  body: z.string().max(MAX_BODY * 2).optional(),
  replyTo: z.string().optional(),
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Введите сообщение" }, { status: 400 });

  const body = sanitizeChatBody(parsed.data.body ?? "").slice(0, MAX_BODY);
  const attachments = parseAttachments(parsed.data.attachments ?? []);
  if (!body && attachments.length === 0) {
    return NextResponse.json({ error: "Введите сообщение" }, { status: 400 });
  }

  const message = await postAdminMessage(parsed.data.threadId, body, parsed.data.replyTo, attachments);
  return NextResponse.json({
    ok: true,
    message: {
      id: message.id,
      threadId: message.threadId,
      sender: message.sender,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      attachments,
      reactions: [],
      replyTo: message.replyTo
        ? { id: message.replyTo.id, body: message.replyTo.body, sender: message.replyTo.sender }
        : null,
    },
  });
}
