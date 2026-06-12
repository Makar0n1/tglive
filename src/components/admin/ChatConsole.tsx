"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAdminChat } from "./AdminChatProvider";
import { StatusBadge } from "./ui";
import { cn, formatDate } from "@/lib/utils";
import { AutoTextarea } from "@/components/chat/AutoTextarea";
import { EmojiHover } from "@/components/chat/EmojiHover";
import { ReplyBar } from "@/components/chat/ReplyBar";
import { ChatMessage, type ChatMsg } from "@/components/chat/ChatMessage";
import { MessageOverlay } from "@/components/chat/MessageOverlay";
import { AttachButton } from "@/components/chat/AttachButton";
import { ChatLightbox } from "@/components/chat/ChatLightbox";
import { StagedStrip, type StagedFile } from "@/components/chat/StagedStrip";
import { applyReactionToggle } from "@/components/chat/reactions";
import { sanitizeChatBody } from "@/lib/chat-text";
import { useChatAppShell } from "@/lib/useChatAppShell";
import { useChatAttachmentSend } from "@/lib/useChatAttachmentSend";
import { validateFile } from "@/lib/chat-media";
import { ArrowLeft, X, Inbox, Send, ChevronDown } from "lucide-react";
import type { ChatEvent, Reaction, Attachment } from "@/lib/chat-bus";

type ConvMessage = ChatMsg;
interface VisitorInfo {
  id: string;
  name: string | null;
  contact: string | null;
  ip: string | null;
  createdAt: string;
}
interface LinkedLead {
  id: string;
  message: string;
  contact: string;
  status: string;
  createdAt: string;
}

export function ChatConsole() {
  const { threads, activeId, setActiveId, markThreadRead, subscribe, unreadTotal } =
    useAdminChat();

  const [messages, setMessages] = useState<ConvMessage[]>([]);
  const [visitor, setVisitor] = useState<VisitorInfo | null>(null);
  const [leads, setLeads] = useState<LinkedLead[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [visitorReadAt, setVisitorReadAt] = useState<string | null>(null);
  const [theyTyping, setTheyTyping] = useState(false);
  const [ctx, setCtx] = useState<{ id: string; rect: DOMRect } | null>(null);
  const [ctxClosing, setCtxClosing] = useState(false);
  const [reply, setReply] = useState<{ id: string; body: string; sender: "VISITOR" | "ADMIN" } | null>(null);
  const [lightbox, setLightbox] = useState<{ images: Attachment[]; index: number } | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  // New app-shell keyboard handling (same as the guest chat; see CLAUDE.md §6.5e).
  const { isMobile, bottomPad, kbUpPad, kbUp, stickyShow, isFirefox } = useChatAppShell(
    activeId !== null,
    paneRef,
    stickyHeaderRef,
    1023,
    "admin-shell"
  );
  const ids = useRef<Set<string>>(new Set());
  const lastTypingSent = useRef(0);
  const typingHide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadThread = useCallback(
    async (threadId: string) => {
      setLoading(true);
      ids.current = new Set();
      try {
        const res = await fetch(`/api/admin/chat/messages?threadId=${threadId}`);
        const data = await res.json();
        (data.messages || []).forEach((m: ConvMessage) => ids.current.add(m.id));
        setMessages(data.messages || []);
        setVisitor(data.visitor || null);
        setLeads(data.leads || []);
        setVisitorReadAt(data.thread?.visitorReadAt ?? null);
        setTheyTyping(false);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  function openThread(id: string) {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setActiveId(id);
    markThreadRead(id);
    loadThread(id);
    // Reflect the open thread in the URL so (a) the service worker can tell
    // which conversation is on screen and suppress its push, and (b) a push
    // deep-link (/admin/chat?t=<id>) opens this exact thread.
    window.history.replaceState(null, "", `/admin/chat?t=${id}`);
  }

  function closeThread() {
    setActiveId(null);
    setTheyTyping(false);
    window.history.replaceState(null, "", "/admin/chat");
    // Keep the content while the panel slides out, then clear.
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => {
      setMessages([]);
      setVisitor(null);
      setLeads([]);
      setVisitorReadAt(null);
    }, 320);
  }

  // Leaving the chat page must clear the active thread, otherwise the provider
  // keeps treating it as "being viewed" and suppresses notifications/badges.
  useEffect(() => {
    return () => setActiveId(null);
  }, [setActiveId]);

  // Deep-link from a push notification: open the thread named in ?t=<id> on
  // first load. Runs once on mount.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    if (t) openThread(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime events for the active thread: messages, read receipts, typing.
  useEffect(() => {
    const unsub = subscribe((evt: ChatEvent) => {
      if (evt.threadId !== activeId) return;

      if (evt.kind === "message") {
        const m = evt.message;
        if (ids.current.has(m.id)) return;
        ids.current.add(m.id);
        setMessages((prev) => [
          ...prev,
          {
            id: m.id,
            sender: m.sender,
            body: m.body,
            createdAt: m.createdAt,
            attachments: m.attachments,
            reactions: m.reactions,
            replyTo: m.replyTo,
          },
        ]);
        if (m.sender === "VISITOR") {
          setTheyTyping(false);
          if (activeId) markThreadRead(activeId);
        }
      } else if (evt.kind === "reaction") {
        const id = evt.messageId;
        setMessages((prev) => prev.map((mm) => (mm.id === id ? { ...mm, reactions: evt.reactions } : mm)));
      } else if (evt.kind === "delete") {
        const id = evt.messageId;
        setMessages((prev) => prev.map((mm) => (mm.id === id ? { ...mm, deleting: true } : mm)));
        setTimeout(() => setMessages((prev) => prev.filter((mm) => mm.id !== id)), 600);
      } else if (evt.kind === "read" && evt.by === "VISITOR") {
        setVisitorReadAt(evt.readAt);
      } else if (evt.kind === "typing" && evt.who === "VISITOR") {
        setTheyTyping(true);
        if (typingHide.current) clearTimeout(typingHide.current);
        typingHide.current = setTimeout(() => setTheyTyping(false), 3500);
      }
    });
    return unsub;
  }, [subscribe, activeId, markThreadRead]);

  // Notify the visitor that the admin is typing (throttled to ~1 / 2s).
  function onInputChange(value: string) {
    setInput(value);
    if (!activeId) return;
    const now = Date.now();
    if (now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now;
      fetch("/api/admin/chat/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: activeId }),
      }).catch(() => {});
    }
  }

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      })
    );
  }, []);

  const onMessagesScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 400);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, theyTyping, scrollToBottom]);

  // Reply bar / staged-files strip grow the composer -> re-scroll to bottom.
  useEffect(() => {
    if (reply || staged.length > 0) scrollToBottom();
  }, [reply, staged.length, scrollToBottom]);

  // Toggle an admin reaction on a message (optimistic; server + SSE reconcile).
  function react(messageId: string, emoji: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, reactions: applyReactionToggle(m.reactions ?? [], "ADMIN", emoji) }
          : m
      )
    );
    fetch("/api/admin/chat/react", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, emoji }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.reactions) {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, reactions: d.reactions } : m))
          );
        }
      })
      .catch(() => {});
  }

  function jumpToMessage(id: string) {
    const run = () => {
      const el = scrollRef.current?.querySelector<HTMLElement>(`[data-msg-id="${id}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => {
        setHighlightId(id);
        window.setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 2000);
      }, 420);
    };
    const active = document.activeElement as HTMLElement | null;
    const kbUp = active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT");
    if (kbUp && window.innerWidth <= 1023) {
      active.blur();
      window.setTimeout(run, 900);
    } else {
      run();
    }
  }

  function startReply(id: string) {
    // Focus synchronously (within the gesture) so the keyboard opens on mobile.
    composerRef.current?.focus();
    setMessages((prev) => {
      const target = prev.find((m) => m.id === id);
      // Admin only replies to visitor messages.
      if (target && target.sender === "VISITOR") {
        setReply({ id, body: target.body, sender: target.sender });
      }
      return prev;
    });
  }

  // Delete own (admin) message — dissolves on both sides via SSE.
  function deleteMessage(id: string) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deleting: true } : m)));
    setTimeout(() => setMessages((prev) => prev.filter((m) => m.id !== id)), 600);
    fetch("/api/admin/chat/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: id }),
    }).catch(() => {});
  }

  async function send() {
    const body = sanitizeChatBody(input);
    if (!body || !activeId || sending) return;
    setSending(true);
    setInput("");
    const replyToMsg = reply;
    setReply(null);
    try {
      const res = await fetch("/api/admin/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: activeId, body, replyTo: replyToMsg?.id }),
      });
      const data = await res.json();
      if (data.message && !ids.current.has(data.message.id)) {
        ids.current.add(data.message.id);
        setMessages((prev) => [...prev, data.message]);
      }
    } catch {
      setInput(body);
    } finally {
      setSending(false);
    }
  }

  // Persist a media/file message (used by the attachment sender).
  const commitAttachments = useCallback(
    async (body: string, attachments: Attachment[], replyToId?: string): Promise<ChatMsg | null> => {
      if (!activeId) return null;
      try {
        const res = await fetch("/api/admin/chat/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId: activeId, body, replyTo: replyToId, attachments }),
        });
        const data = await res.json();
        if (data.message) ids.current.add(data.message.id); // so SSE doesn't dupe
        return (data.message as ChatMsg) ?? null;
      } catch {
        return null;
      }
    },
    [activeId]
  );

  const { sendFiles, cancelUpload } = useChatAttachmentSend({
    uploadUrl: "/api/admin/chat/upload",
    mySide: "ADMIN",
    setMessages,
    commit: commitAttachments,
    onError: (msg) => {
      setMediaError(msg);
      window.setTimeout(() => setMediaError(null), 4000);
    },
  });

  function stageFiles(files: File[]) {
    if (!activeId) return;
    setStaged((prev) => {
      const next = [...prev];
      for (const f of files) {
        const err = validateFile(f);
        if (err) {
          setMediaError(err);
          window.setTimeout(() => setMediaError(null), 4000);
          continue;
        }
        next.push({
          id: `s_${Date.now()}_${Math.round(Math.random() * 1e6)}`,
          file: f,
          previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
        });
      }
      return next;
    });
  }

  function removeStaged(id: string) {
    setStaged((prev) => {
      const item = prev.find((s) => s.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  }

  function onSend() {
    if (staged.length > 0) {
      const files = staged.map((s) => s.file);
      staged.forEach((s) => s.previewUrl && URL.revokeObjectURL(s.previewUrl));
      const caption = sanitizeChatBody(input);
      const replyId = reply?.id;
      setStaged([]);
      setInput("");
      setReply(null);
      sendFiles(files, caption, replyId);
      return;
    }
    send();
  }

  return (
    <div className="relative h-[calc(100dvh-11rem)] gap-4 overflow-hidden lg:grid lg:h-[calc(100vh-9rem)] lg:grid-cols-[20rem_1fr] lg:overflow-visible">
      {/* Threads list (always present; covered by the sliding conversation on mobile) */}
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-bg-border bg-bg-soft">
        <div className="flex items-center justify-between border-b border-bg-border px-4 py-3">
          <span className="text-sm font-semibold text-fg">Диалоги</span>
        </div>
        <div className="chat-scroll flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <p className="p-6 text-center text-sm text-fg-faint">Диалогов пока нет</p>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                onClick={() => openThread(t.id)}
                className={cn(
                  "flex w-full flex-col gap-0.5 border-b border-bg-border px-4 py-3 text-left transition",
                  activeId === t.id ? "bg-bg-card" : "hover:bg-bg-card/50"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-fg">
                    {t.visitorName || t.visitorContact || "Гость"}
                  </span>
                  {t.unread > 0 ? (
                    <span className="shrink-0 rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                      {t.unread}
                    </span>
                  ) : null}
                </div>
                <span className="truncate text-xs text-fg-muted">
                  {t.lastSender === "ADMIN" ? "Вы: " : ""}
                  {t.lastBody}
                </span>
                {t.leadsCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-accent">
                    <Inbox size={11} /> заявок: {t.leadsCount}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Conversation. Desktop: a static grid column. Mobile: app-shell — a
          NORMAL-FLOW pane portaled to <body> while the admin shell (#admin-shell)
          is hidden by the hook, so iOS has no scrollable background / fixed input
          (the only thing that fully kills the keyboard jump + offsetTop jitter). */}
      {(() => {
        const pane = (
          <div
            ref={paneRef}
            className="relative flex h-full w-full flex-col overflow-hidden bg-bg-soft lg:rounded-xl lg:border lg:border-bg-border"
          >
        {!activeId && !visitor ? (
          <div className="hidden flex-1 items-center justify-center text-fg-faint lg:flex">
            Выберите диалог слева
          </div>
        ) : (
          <>
            {/* Visitor / linked person header */}
            <div className="border-b border-bg-border px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {/* Back to list on mobile — badge = unread in other threads */}
                  <button
                    onClick={closeThread}
                    aria-label="Назад"
                    className="relative -ml-1 flex shrink-0 items-center rounded-md px-1.5 py-1 text-fg-muted transition hover:text-fg lg:hidden"
                  >
                    <ArrowLeft size={20} />
                    {unreadTotal > 0 ? (
                      <span className="absolute -right-1 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                        {unreadTotal > 9 ? "9+" : unreadTotal}
                      </span>
                    ) : null}
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-fg">
                      {visitor?.name || "Гость"}
                    </p>
                    <p className="truncate text-xs text-fg-muted">
                      {visitor?.contact || "контакт не указан"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeThread}
                  title="Закрыть чат"
                  className="hidden shrink-0 items-center gap-1 rounded-md border border-bg-border px-2.5 py-1 text-sm text-fg-muted transition hover:text-fg lg:flex"
                >
                  <X size={14} /> Закрыть
                </button>
              </div>
              {leads.length > 0 ? (
                <div className="mt-2 rounded-lg border border-accent/30 bg-accent/5 p-2">
                  <p className="mb-1 text-xs font-medium text-accent">
                    Заявки этого человека ({leads.length}):
                  </p>
                  <div className="space-y-1">
                    {leads.map((l) => (
                      <div key={l.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-fg-muted">{l.message}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          <StatusBadge status={l.status} />
                          <span className="text-fg-faint">{formatDate(l.createdAt)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Messages */}
            <div className="relative flex min-h-0 flex-1 flex-col">
            <div ref={scrollRef} onScroll={onMessagesScroll} className="chat-scroll flex-1 overflow-y-auto p-4">
              {/* min-h-full + justify-end pins messages to the bottom */}
              <div className="flex min-h-[calc(100%+1px)] flex-col justify-end space-y-2">
              {loading ? (
                <p className="text-center text-sm text-fg-faint">Загрузка…</p>
              ) : (
                messages.map((m) => {
                  const isRead =
                    m.sender === "ADMIN" && !!visitorReadAt && m.createdAt <= visitorReadAt;
                  return (
                    <div
                      key={m.id}
                      data-chat-msg
                      data-msg-id={m.id}
                      className={cn("animate-bubble", ctx?.id === m.id && !ctxClosing && "invisible")}
                    >
                      <ChatMessage
                        message={m}
                        mySide="ADMIN"
                        isRead={isRead}
                        onOpenContext={(id, rect) => {
                          setCtxClosing(false);
                          setCtx({ id, rect });
                        }}
                        onReact={react}
                        onReply={startReply}
                        onDismiss={() => composerRef.current?.blur()}
                        onCancelUpload={cancelUpload}
                        onOpenImage={(images, index) => setLightbox({ images, index })}
                        onJumpTo={jumpToMessage}
                        highlighted={highlightId === m.id}
                      />
                    </div>
                  );
                })
              )}
              {theyTyping ? (
                <div className="flex animate-fade-in items-center gap-1 px-1 text-xs text-fg-faint">
                  <span className="inline-flex gap-0.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-faint [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-faint [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-faint" />
                  </span>
                  печатает…
                </div>
              ) : null}
              </div>
            </div>
            {showScrollDown ? (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
                }
                aria-label="К последним сообщениям"
                className="absolute bottom-3 right-3 z-[5] flex h-9 w-9 animate-fade-in items-center justify-center rounded-full bg-bg-card/95 text-fg shadow-lg ring-1 ring-bg-border backdrop-blur transition hover:bg-bg-card"
              >
                <ChevronDown size={20} />
              </button>
            ) : null}
            </div>

            {/* Composer */}
            <div
              className={cn(
                "border-t border-bg-border px-2.5 pt-2 lg:pb-3",
                kbUp ? kbUpPad : bottomPad
              )}
            >
              {mediaError ? (
                <p className="mb-2 rounded-md bg-red-500/15 px-2 py-1 text-xs text-red-300">{mediaError}</p>
              ) : null}
              {reply ? <ReplyBar body={reply.body} onCancel={() => setReply(null)} /> : null}
              <StagedStrip files={staged} onRemove={removeStaged} />
              {/* Mobile: lightly-rounded pill (text · attach). Desktop: flat input
                  with a full-width bottom border (emoji · text · attach). */}
              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center rounded-xl border border-bg-border bg-bg transition-colors lg:rounded-none lg:border-x-0 lg:border-t-0 lg:border-b lg:bg-transparent lg:focus-within:border-accent">
                  <div className="hidden shrink-0 lg:block">
                    <EmojiHover align="left" onPick={(e) => setInput((prev) => prev + e)} />
                  </div>
                  <AutoTextarea
                    value={input}
                    onChange={onInputChange}
                    onSubmit={onSend}
                    inputRef={composerRef}
                    placeholder="Ответить…"
                    className="flex-1 resize-none bg-transparent py-2.5 pl-3.5 pr-1.5 text-sm text-fg outline-none placeholder:text-fg-faint lg:pl-1.5"
                  />
                  <div className="shrink-0">
                    <AttachButton align="right" onFiles={stageFiles} />
                  </div>
                </div>
                {staged.length > 0 || sanitizeChatBody(input) ? (
                  <button
                    onClick={onSend}
                    onMouseDown={(e) => e.preventDefault()}
                    disabled={sending}
                    aria-label="Отправить"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-sm transition active:scale-95 disabled:opacity-50"
                  >
                    <Send size={18} />
                  </button>
                ) : null}
              </div>
            </div>
          </>
        )}
        {/* Lightbox inside the conversation pane. */}
        {lightbox ? (
          <ChatLightbox images={lightbox.images} index={lightbox.index} onClose={() => setLightbox(null)} />
        ) : null}
          </div>
        );
        // Mobile: portal the (normal-flow) pane out of the hidden #admin-shell to
        // <body> while a thread is open; otherwise the thread list shows.
        return isMobile ? (activeId ? createPortal(pane, document.body) : null) : pane;
      })()}

      {/* Focus overlay (viewport-fixed). On mobile portal it to <body> too —
          it would otherwise live inside the hidden #admin-shell. */}
      {ctx
        ? (() => {
            const msg = messages.find((m) => m.id === ctx.id);
            if (!msg) return null;
            const overlay = (
              <MessageOverlay
                message={msg}
                mySide="ADMIN"
                isRead={!!visitorReadAt && msg.createdAt <= visitorReadAt}
                anchor={ctx.rect}
                container={paneRef.current}
                canReply={msg.sender === "VISITOR"}
                canDelete={msg.sender === "ADMIN"}
                onReact={react}
                onReply={startReply}
                onDelete={deleteMessage}
                onClosing={() => setCtxClosing(true)}
                onClose={() => {
                  setCtx(null);
                  setCtxClosing(false);
                }}
              />
            );
            return isMobile ? createPortal(overlay, document.body) : overlay;
          })()
        : null}

      {/* Sticky header (mobile, keyboard up): the real header scrolls off, so a
          compact back + name bar slides in from the top. Portaled to <body>
          because #admin-shell (where it'd otherwise live) is hidden. Skipped on
          Firefox, where the header doesn't scroll off. */}
      {activeId && isMobile && !isFirefox
        ? createPortal(
            <div
              ref={stickyHeaderRef}
              className="pointer-events-none fixed left-0 right-0 z-[61] overflow-hidden"
              style={{ top: 0 }}
            >
              <div
                className={cn(
                  "flex items-center gap-2 border-b border-bg-border bg-bg-soft/95 px-3 py-3 backdrop-blur transition-all duration-300 ease-out",
                  stickyShow
                    ? "pointer-events-auto translate-y-0 opacity-100"
                    : "pointer-events-none -translate-y-full opacity-0"
                )}
              >
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={closeThread}
                  aria-label="Назад"
                  className="-ml-1 flex shrink-0 items-center rounded-md px-1.5 py-1 text-fg-muted transition hover:text-fg"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-fg">
                    {visitor?.name || "Гость"}
                  </p>
                  <p className="truncate text-xs text-fg-muted">
                    {visitor?.contact || "контакт не указан"}
                  </p>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
