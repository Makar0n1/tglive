"use client";

import { useRef, useState } from "react";
import { cn, formatTimeMsk } from "@/lib/utils";
import { BubbleMeta } from "./BubbleMeta";
import { ReadTicks as Ticks } from "./ReadTicks";
import { Dissolve } from "./Dissolve";
import { Attachments } from "./Attachments";
import type { Reaction, Attachment } from "@/lib/chat-bus";
import type { UploadItem } from "@/lib/chat-media";

export interface ChatMsg {
  id: string;
  sender: "VISITOR" | "ADMIN";
  body: string;
  createdAt: string;
  reactions?: Reaction[];
  replyTo?: { id: string; body: string; sender: "VISITOR" | "ADMIN" } | null;
  attachments?: Attachment[];
  // Uploads in progress (optimistic message), each with % + cancel.
  uploads?: UploadItem[];
  pending?: boolean;
  deleting?: boolean;
  // Stable React key so swapping an optimistic message for the persisted one
  // doesn't remount the bubble (which would re-play the entrance animation).
  clientKey?: string;
}

type Side = "VISITOR" | "ADMIN";

function reactionGroups(reactions: Reaction[], mySide: Side) {
  const map = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const cur = map.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.by === mySide) cur.mine = true;
    map.set(r.emoji, cur);
  }
  return Array.from(map, ([emoji, v]) => ({ emoji, ...v }));
}

const firstLine = (s: string) => s.split("\n")[0] ?? "";

// Presentational bubble — shared by the message list and the context overlay.
export function Bubble({
  message: m,
  mySide,
  isRead,
  onReact,
  innerRef,
  onCancelUpload,
  onOpenImage,
  onJumpTo,
  highlighted,
}: {
  message: ChatMsg;
  mySide: Side;
  isRead: boolean;
  onReact: (id: string, emoji: string) => void;
  innerRef?: React.Ref<HTMLDivElement>;
  onCancelUpload?: (localId: string) => void;
  onOpenImage?: (images: Attachment[], index: number) => void;
  // Tap the reply quote -> jump to the replied-to message.
  onJumpTo?: (id: string) => void;
  highlighted?: boolean;
}) {
  const own = m.sender === mySide;
  const groups = reactionGroups(m.reactions ?? [], mySide);
  const hasMedia = !!(m.attachments?.length || m.uploads?.length);
  const hasText = !!m.body;

  const reactionsRow =
    groups.length > 0 ? (
      <div className="flex flex-wrap gap-1">
        {groups.map((g) => (
          <button
            key={g.emoji}
            type="button"
            onClick={() => onReact(m.id, g.emoji)}
            className={cn(
              "flex animate-reaction-pop items-center gap-0.5 rounded-full px-1.5 py-0.5 text-sm leading-none",
              own ? cn("bg-white/20", g.mine && "ring-1 ring-white/70") : cn("bg-accent/20 text-accent", g.mine && "ring-1 ring-accent/60")
            )}
          >
            <span>{g.emoji}</span>
            {g.count > 1 ? <span className="text-[11px] font-medium">{g.count}</span> : null}
          </button>
        ))}
      </div>
    ) : null;

  const metaInner = (
    <>
      <span>{formatTimeMsk(m.createdAt)}</span>
      {own ? <Ticks read={isRead} /> : null}
    </>
  );
  const metaSpan = (
    <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs leading-none opacity-60">
      {metaInner}
    </span>
  );

  return (
    <div
      ref={innerRef}
      className={cn(
        "max-w-full select-none rounded-2xl text-sm [-webkit-touch-callout:none]",
        hasMedia ? "p-1" : "px-3 py-2",
        own ? "rounded-br-none bg-accent text-white" : "rounded-bl-none bg-bg-card text-fg",
        highlighted && "animate-msg-pulse"
      )}
    >
      {m.replyTo ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (m.replyTo) onJumpTo?.(m.replyTo.id);
          }}
          onTouchStart={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className={cn(
            "mb-1 block w-full border-l-2 pl-2 text-left text-xs opacity-80 transition-opacity hover:opacity-100",
            hasMedia && "mx-1 mt-0.5",
            own ? "border-white/70" : "border-accent/70"
          )}
        >
          <span className="line-clamp-1">{firstLine(m.replyTo.body)}</span>
        </button>
      ) : null}

      {hasMedia ? (
        // Fixed media width so the caption wraps to the photo block's width
        // (narrow but harmonious) instead of stretching the whole bubble.
        <div className="w-64 max-w-full">
          <Attachments
            attachments={m.attachments}
            uploads={m.uploads}
            own={own}
            onCancel={onCancelUpload}
            onOpenImage={onOpenImage}
          />
          <div className="relative px-2 pb-1.5 pt-1.5">
            {hasText ? <span className="whitespace-pre-wrap break-words">{m.body}</span> : null}
            {groups.length > 0 ? (
              <div className={cn("flex items-center justify-between gap-3", hasText && "mt-1.5")}>
                {reactionsRow}
                {metaSpan}
              </div>
            ) : hasText ? (
              // Telegram float: time sits on the caption's last line if it fits.
              <>
                <span aria-hidden className="invisible ml-2 inline-flex select-none items-center gap-1 align-bottom text-xs leading-none">
                  {metaInner}
                </span>
                <span className="absolute bottom-[7px] right-2 flex items-center gap-1 text-xs leading-none opacity-60">
                  {metaInner}
                </span>
              </>
            ) : (
              <div className="flex justify-end">{metaSpan}</div>
            )}
          </div>
        </div>
      ) : (
        <>
          {hasText ? <span className="whitespace-pre-wrap break-words">{m.body}</span> : null}
          {groups.length > 0 ? (
            <div className="mt-1 flex items-center justify-between gap-3">
              {reactionsRow}
              {metaSpan}
            </div>
          ) : (
            <BubbleMeta time={formatTimeMsk(m.createdAt)} showTicks={own} read={isRead} pending={m.pending} />
          )}
        </>
      )}
    </div>
  );
}

// List item: renders a Bubble + handles gestures (long-press / right-click /
// double-click / double-tap / swipe). Measures its bubble rect on open so the
// parent can lift it above a blur overlay.
export function ChatMessage({
  message: m,
  mySide,
  isRead,
  onOpenContext,
  onReact,
  onReply,
  onDismiss,
  onCancelUpload,
  onOpenImage,
  onJumpTo,
  highlighted,
}: {
  message: ChatMsg;
  mySide: Side;
  isRead: boolean;
  onOpenContext: (id: string, rect: DOMRect) => void;
  onReact: (id: string, emoji: string) => void;
  onReply: (id: string) => void;
  // Single tap on the row -> dismiss the keyboard (after the double-tap window).
  onDismiss?: () => void;
  onCancelUpload?: (localId: string) => void;
  onOpenImage?: (images: Attachment[], index: number) => void;
  onJumpTo?: (id: string) => void;
  highlighted?: boolean;
}) {
  const own = m.sender === mySide;
  const canReply = !own && !m.pending;

  const [swipe, setSwipe] = useState(0);
  const [pressing, setPressing] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressH = useRef(0); // bubble height captured when the press-scale kicks in
  const lastTap = useRef(0);
  const moved = useRef(false);
  const touchedAt = useRef(0); // suppress the touch-synthesized dblclick
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelDismiss = () => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  };

  // While dissolving, render the particle effect and ignore interactions.
  if (m.deleting) {
    return (
      <div className={cn("flex flex-col", own ? "items-end" : "items-start")}>
        <div className="max-w-[80%]">
          <Dissolve accent={own}>
            <Bubble message={m} mySide={mySide} isRead={isRead} onReact={() => {}} />
          </Dissolve>
        </div>
      </div>
    );
  }

  function openContext(fromTouch = false) {
    cancelDismiss();
    const doOpen = () => {
      const rect = bubbleRef.current?.getBoundingClientRect();
      if (rect) onOpenContext(m.id, rect);
    };
    // Mobile, keyboard up: keep the keyboard UP and open the menu in place when
    // the message + its menu (reactions above + actions below ~ 130px) still fit
    // in the visible area above the keyboard. Only drop the keyboard when it
    // wouldn't fit (a tall message) or for images — then wait for the panel to
    // expand and open by the message's NEW position.
    const active = document.activeElement as HTMLElement | null;
    const keyboardUp =
      fromTouch && active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT");
    if (keyboardUp) {
      const rect = bubbleRef.current?.getBoundingClientRect();
      const visH = window.visualViewport?.height ?? window.innerHeight;
      const hasImage = m.attachments?.some((a) => a.type === "image");
      const tooBig = !rect || rect.height + 130 > visH;
      if (hasImage || tooBig) {
        active!.blur();
        // Let the keyboard fully collapse + the panel settle before opening.
        setTimeout(doOpen, 900);
        return;
      }
      // Fits — keep the keyboard, open the menu over it.
    }
    doOpen();
  }

  function clearLong() {
    if (longPress.current) {
      clearTimeout(longPress.current);
      longPress.current = null;
    }
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    if (m.pending) return;
    cancelDismiss();
    const t = e.touches[0]!;
    start.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    moved.current = false;
    clearLong();
    // Press-scale only kicks in after a deliberate 250ms hold (NOT instantly on
    // touch — that flashed on every tap/scroll start). The magnitude shrinks for
    // tall bubbles (see pressScale) so a big message grows as gently as a small one.
    pressTimer.current = setTimeout(() => {
      pressH.current = bubbleRef.current?.offsetHeight ?? 0;
      setPressing(true);
    }, 250);
    longPress.current = setTimeout(() => {
      setPressing(false);
      navigator.vibrate?.(12);
      openContext(true);
    }, 430);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!start.current) return;
    const t = e.touches[0]!;
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      moved.current = true;
      clearLong();
      setPressing(false);
    }
    if (canReply && Math.abs(dx) > Math.abs(dy) && dx < 0) {
      setSwipe(Math.max(dx, -70));
    } else if (Math.abs(dy) > 8) {
      setSwipe(0);
    }
  }

  function onTouchEnd() {
    clearLong();
    setPressing(false);
    touchedAt.current = Date.now();
    const s = start.current;
    start.current = null;

    if (swipe <= -45 && canReply) {
      onReply(m.id); // keyboard stays (reply focuses the input)
      setSwipe(0);
      return;
    }
    setSwipe(0);

    if (s && !moved.current && Date.now() - s.t < 250) {
      const now = Date.now();
      if (canReply && now - lastTap.current < 300) {
        // Double tap -> ❤️. Keep the keyboard (cancel the pending dismiss).
        cancelDismiss();
        onReact(m.id, "❤️");
        lastTap.current = 0;
      } else {
        lastTap.current = now;
        // Single tap -> dismiss the keyboard, but only after the double-tap
        // window (so a second tap can cancel it and react instead).
        if (onDismiss) {
          cancelDismiss();
          dismissTimer.current = setTimeout(() => onDismiss(), 320);
        }
      }
    }
  }

  return (
    // Gestures live on the FULL-WIDTH row (like Telegram): swipe / long-press /
    // double-click work anywhere on the line, not only on the bubble.
    <div
      className={cn("flex flex-col", own ? "items-end" : "items-start")}
      // Don't let a tap on a message blur the input by itself — keyboard
      // dismissal is handled explicitly (single tap) so double-tap/reply keep it.
      onMouseDown={(e) => e.preventDefault()}
      onContextMenu={(e) => {
        if (m.pending) return;
        e.preventDefault();
        openContext();
      }}
      onDoubleClick={() => {
        // Desktop (mouse) only — on mobile the double-tap is the ❤️ reaction,
        // not reply. Ignore the dblclick synthesized from a touch double-tap.
        if (Date.now() - touchedAt.current < 700) return;
        if (canReply) onReply(m.id);
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        style={{
          // Grow by a near-constant ~8px regardless of bubble height, so a tall
          // message scales as subtly as a short one (plain 1.03 made big bubbles
          // lurch). transition eased over 200ms for a soft, non-abrupt feel.
          transform: `translateX(${swipe}px) scale(${
            pressing ? 1 + Math.min(0.03, 8 / Math.max(pressH.current, 80)) : 1
          })`,
        }}
        className="max-w-[80%] transition-transform duration-200 ease-out"
      >
        <Bubble
          message={m}
          mySide={mySide}
          isRead={isRead}
          onReact={onReact}
          innerRef={bubbleRef}
          onCancelUpload={onCancelUpload}
          onOpenImage={onOpenImage}
          onJumpTo={onJumpTo}
          highlighted={highlighted}
        />
      </div>
    </div>
  );
}
