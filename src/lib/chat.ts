import "server-only";
import { prisma } from "./prisma";
import type { ChatMessage, ChatSender } from "@prisma/client";
import {
  publishToAdmin,
  publishToVisitor,
  type ChatEventMessage,
  type Reaction,
  type Attachment,
} from "./chat-bus";
import { sendPushToAdmins } from "./push";

export const MAX_BODY = 4000;
export const MAX_ATTACHMENTS = 5;

const ALLOWED_REACTIONS = ["👍", "❤️", "🔥", "😂", "😮", "🙏"];

// A message row optionally carrying its reply target snippet.
type MessageWithReply = ChatMessage & {
  replyTo?: { id: string; body: string; sender: ChatSender } | null;
};

// Prisma include used wherever we map to event messages.
const replyInclude = { replyTo: { select: { id: true, body: true, sender: true } } } as const;

function parseReactions(raw: unknown): Reaction[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is Reaction =>
      !!r &&
      typeof r.emoji === "string" &&
      (r.by === "VISITOR" || r.by === "ADMIN")
  );
}

export function parseAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (a): a is Attachment =>
        !!a &&
        (a.type === "image" || a.type === "file") &&
        typeof a.url === "string" &&
        typeof a.name === "string" &&
        typeof a.size === "number" &&
        typeof a.mime === "string"
    )
    .slice(0, MAX_ATTACHMENTS);
}

function toEventMessage(m: MessageWithReply): ChatEventMessage {
  return {
    id: m.id,
    threadId: m.threadId,
    sender: m.sender,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    attachments: parseAttachments(m.attachments),
    reactions: parseReactions(m.reactions),
    replyTo: m.replyTo
      ? { id: m.replyTo.id, body: m.replyTo.body, sender: m.replyTo.sender }
      : null,
  };
}

// Toggle one side's reaction on a message (at most one reaction per side):
// same emoji -> remove; different/none -> set. Returns the updated reactions.
export async function toggleReaction(
  messageId: string,
  by: "VISITOR" | "ADMIN",
  emoji: string,
  opts: { visitorId?: string } = {}
): Promise<Reaction[] | null> {
  if (!ALLOWED_REACTIONS.includes(emoji)) return null;
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    include: { thread: true },
  });
  if (!message) return null;
  // Visitor may only react within their own thread.
  if (opts.visitorId && message.thread.visitorId !== opts.visitorId) return null;

  const current = parseReactions(message.reactions);
  const mine = current.find((r) => r.by === by);
  let next: Reaction[];
  if (mine && mine.emoji === emoji) {
    next = current.filter((r) => r.by !== by); // remove
  } else {
    next = [...current.filter((r) => r.by !== by), { emoji, by }]; // set/replace
  }

  await prisma.chatMessage.update({
    where: { id: messageId },
    data: { reactions: next as unknown as object[] },
  });

  const evt = {
    kind: "reaction" as const,
    threadId: message.threadId,
    visitorId: message.thread.visitorId,
    messageId,
    reactions: next,
  };
  publishToAdmin(evt);
  publishToVisitor(message.thread.visitorId, evt);
  return next;
}

export async function getOrCreateThread(visitorId: string) {
  const existing = await prisma.chatThread.findUnique({ where: { visitorId } });
  if (existing) return existing;
  return prisma.chatThread.create({ data: { visitorId } });
}

// Resolve a valid reply target id: it must be in the same thread and be from
// the OTHER side (we only reply to the interlocutor).
async function resolveReplyTo(
  threadId: string,
  sender: "VISITOR" | "ADMIN",
  replyToId?: string | null
): Promise<string | null> {
  if (!replyToId) return null;
  const target = await prisma.chatMessage.findUnique({
    where: { id: replyToId },
    select: { id: true, threadId: true, sender: true },
  });
  if (!target || target.threadId !== threadId || target.sender === sender) return null;
  return target.id;
}

// Visitor sends a message -> admin gets an unread + realtime event.
export async function postVisitorMessage(
  visitorId: string,
  body: string,
  replyToId?: string | null,
  attachments: Attachment[] = []
) {
  const thread = await getOrCreateThread(visitorId);
  const validReplyTo = await resolveReplyTo(thread.id, "VISITOR", replyToId);
  const [message] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        sender: "VISITOR",
        body,
        replyToId: validReplyTo,
        attachments: attachments as unknown as object[],
      },
      include: replyInclude,
    }),
    prisma.chatThread.update({
      where: { id: thread.id },
      data: { adminUnread: { increment: 1 }, lastMessageAt: new Date() },
    }),
  ]);

  const evt = toEventMessage(message);
  publishToAdmin({ kind: "message", threadId: thread.id, visitorId, message: evt });
  publishToVisitor(visitorId, { kind: "message", threadId: thread.id, visitorId, message: evt });

  // Web Push so the admin is notified even with the app closed. Fire-and-forget
  // (name lookup + delivery must not delay the visitor's send response).
  void (async () => {
    const v = await prisma.visitor.findUnique({
      where: { id: visitorId },
      select: { name: true },
    });
    const preview = body.trim()
      ? body.trim()
      : attachments.length
        ? "📎 Вложение"
        : "Новое сообщение";
    await sendPushToAdmins({
      title: v?.name ? `💬 ${v.name}` : "💬 Новое сообщение",
      body: preview.slice(0, 140),
      tag: `thread-${thread.id}`,
      threadId: thread.id,
      url: `/admin/chat?t=${thread.id}`,
    });
  })().catch(() => {});

  return message;
}

// Admin replies -> visitor gets an unread + realtime event.
export async function postAdminMessage(
  threadId: string,
  body: string,
  replyToId?: string | null,
  attachments: Attachment[] = []
) {
  const thread = await prisma.chatThread.update({
    where: { id: threadId },
    data: { visitorUnread: { increment: 1 }, lastMessageAt: new Date() },
  });
  const validReplyTo = await resolveReplyTo(threadId, "ADMIN", replyToId);
  const message = await prisma.chatMessage.create({
    data: {
      threadId,
      sender: "ADMIN",
      body,
      replyToId: validReplyTo,
      attachments: attachments as unknown as object[],
    },
    include: replyInclude,
  });

  const evt = toEventMessage(message);
  publishToVisitor(thread.visitorId, {
    kind: "message",
    threadId,
    visitorId: thread.visitorId,
    message: evt,
  });
  publishToAdmin({ kind: "message", threadId, visitorId: thread.visitorId, message: evt });
  return message;
}

export async function markAdminRead(threadId: string) {
  const readAt = new Date();
  const thread = await prisma.chatThread.update({
    where: { id: threadId },
    data: { adminUnread: 0, adminReadAt: readAt },
  });
  const evt = {
    kind: "read" as const,
    threadId,
    visitorId: thread.visitorId,
    by: "ADMIN" as const,
    readAt: readAt.toISOString(),
  };
  // Visitor: their sent messages are now read. Admin: sync badge across tabs.
  publishToVisitor(thread.visitorId, evt);
  publishToAdmin(evt);
}

export async function markVisitorRead(visitorId: string) {
  const thread = await prisma.chatThread.findUnique({ where: { visitorId } });
  if (!thread) return;
  const readAt = new Date();
  await prisma.chatThread.update({
    where: { id: thread.id },
    data: { visitorUnread: 0, visitorReadAt: readAt },
  });
  const evt = {
    kind: "read" as const,
    threadId: thread.id,
    visitorId,
    by: "VISITOR" as const,
    readAt: readAt.toISOString(),
  };
  // Admin: their sent messages are now read. Visitor: sync across tabs.
  publishToAdmin(evt);
  publishToVisitor(visitorId, evt);
}

// Delete a message — only the author's own message. Broadcasts a delete event
// so both sides can play the dissolve effect and drop it.
export async function deleteMessage(
  messageId: string,
  by: "VISITOR" | "ADMIN",
  opts: { visitorId?: string } = {}
): Promise<boolean> {
  const m = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    include: { thread: true },
  });
  if (!m) return false;
  if (m.sender !== by) return false; // only own messages
  if (opts.visitorId && m.thread.visitorId !== opts.visitorId) return false;

  await prisma.chatMessage.delete({ where: { id: messageId } });
  const evt = {
    kind: "delete" as const,
    threadId: m.threadId,
    visitorId: m.thread.visitorId,
    messageId,
  };
  publishToAdmin(evt);
  publishToVisitor(m.thread.visitorId, evt);
  return true;
}

// Transient "typing" signals (not persisted).
export function notifyVisitorTyping(visitorId: string, threadId: string) {
  publishToAdmin({ kind: "typing", threadId, visitorId, who: "VISITOR" });
}

export function notifyAdminTyping(threadId: string, visitorId: string) {
  publishToVisitor(visitorId, { kind: "typing", threadId, visitorId, who: "ADMIN" });
}

// Snapshot for the visitor widget on load.
export async function getVisitorState(visitorId: string) {
  const thread = await prisma.chatThread.findUnique({
    where: { visitorId },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 200, include: replyInclude } },
  });
  if (!thread) return { messages: [], unread: 0, adminReadAt: null, visitorReadAt: null };
  return {
    messages: thread.messages.map(toEventMessage),
    unread: thread.visitorUnread,
    // For the visitor's read receipts: when the admin last read their messages.
    adminReadAt: thread.adminReadAt ? thread.adminReadAt.toISOString() : null,
    visitorReadAt: thread.visitorReadAt ? thread.visitorReadAt.toISOString() : null,
  };
}
