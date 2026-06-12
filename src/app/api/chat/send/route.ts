import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveVisitor } from "@/lib/visitor";
import { postVisitorMessage, parseAttachments, MAX_BODY, MAX_ATTACHMENTS } from "@/lib/chat";
import { sanitizeChatBody } from "@/lib/chat-text";
import { getClientIp, getUserAgent } from "@/lib/request";
import { rateLimit, sweep } from "@/lib/ratelimit";

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
  body: z.string().max(MAX_BODY * 2).optional(),
  name: z.string().trim().max(120).optional(),
  contact: z.string().trim().max(200).optional(),
  replyTo: z.string().optional(),
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).optional(),
});

export async function POST(req: Request) {
  sweep();
  const ip = await getClientIp();
  // Light flood protection: 20 messages / minute per IP.
  const rl = rateLimit(`chat:${ip ?? "unknown"}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: "Слишком быстро" }, { status: 429 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Введите сообщение" }, { status: 400 });
  }

  const body = sanitizeChatBody(parsed.data.body ?? "").slice(0, MAX_BODY);
  const attachments = parseAttachments(parsed.data.attachments ?? []);
  if (!body && attachments.length === 0) {
    return NextResponse.json({ error: "Введите сообщение" }, { status: 400 });
  }

  const visitor = await resolveVisitor({
    name: parsed.data.name,
    contact: parsed.data.contact,
    ip,
    userAgent: await getUserAgent(),
  });

  const message = await postVisitorMessage(visitor.id, body, parsed.data.replyTo, attachments);

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
