import { EventEmitter } from "node:events";

// In-process pub/sub for realtime chat. Sufficient for a single-node
// deployment (the docker-compose setup). For horizontal scaling, replace the
// emitter with Redis pub/sub or Postgres LISTEN/NOTIFY behind the same API.
type Listener = (payload: ChatEvent) => void;

export interface Reaction {
  emoji: string;
  by: "VISITOR" | "ADMIN";
}

export interface Attachment {
  type: "image" | "file";
  url: string;
  name: string;
  size: number; // bytes
  mime: string;
  width?: number;
  height?: number;
}

export type ChatEvent =
  | { kind: "message"; threadId: string; visitorId: string; message: ChatEventMessage }
  | { kind: "read"; threadId: string; visitorId: string; by: "ADMIN" | "VISITOR"; readAt: string }
  | { kind: "typing"; threadId: string; visitorId: string; who: "ADMIN" | "VISITOR" }
  | { kind: "reaction"; threadId: string; visitorId: string; messageId: string; reactions: Reaction[] }
  | { kind: "delete"; threadId: string; visitorId: string; messageId: string }
  | { kind: "thread"; threadId: string; visitorId: string };

export interface ReplyRef {
  id: string;
  body: string;
  sender: "VISITOR" | "ADMIN";
}

export interface ChatEventMessage {
  id: string;
  threadId: string;
  sender: "VISITOR" | "ADMIN";
  body: string;
  createdAt: string;
  attachments: Attachment[];
  reactions: Reaction[];
  replyTo?: ReplyRef | null;
}

const g = globalThis as unknown as { __chatBus?: EventEmitter };
const bus = g.__chatBus ?? new EventEmitter();
bus.setMaxListeners(0);
g.__chatBus = bus;

const ADMIN_CHANNEL = "admin";
const visitorChannel = (visitorId: string) => `visitor:${visitorId}`;

export function publishToAdmin(event: ChatEvent) {
  bus.emit(ADMIN_CHANNEL, event);
}

export function publishToVisitor(visitorId: string, event: ChatEvent) {
  bus.emit(visitorChannel(visitorId), event);
}

export function subscribeAdmin(listener: Listener): () => void {
  bus.on(ADMIN_CHANNEL, listener);
  return () => bus.off(ADMIN_CHANNEL, listener);
}

export function subscribeVisitor(visitorId: string, listener: Listener): () => void {
  const ch = visitorChannel(visitorId);
  bus.on(ch, listener);
  return () => bus.off(ch, listener);
}
