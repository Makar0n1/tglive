"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Reply, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Bubble, type ChatMsg } from "./ChatMessage";
import { REACTION_EMOJIS } from "./reactions";

const GAP = 8;
const MENU_H = 46;
const REPLY_H = 40;
const ANIM = 180; // exit duration (ms)

// Telegram-style focus overlay: blurs the whole pane, lifts the selected
// message above it, shows the reaction picker above and a reply action below.
export function MessageOverlay({
  message,
  mySide,
  isRead,
  anchor,
  container,
  canReply,
  canDelete,
  onReact,
  onReply,
  onDelete,
  onClose,
  onClosing,
}: {
  message: ChatMsg;
  mySide: "VISITOR" | "ADMIN";
  isRead: boolean;
  anchor: DOMRect;
  container: HTMLElement | null;
  canReply: boolean;
  canDelete: boolean;
  onReact: (id: string, emoji: string) => void;
  onReply: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  // Fired the moment closing starts -> reveal the original under the fading
  // clone so there's no empty gap.
  onClosing?: () => void;
}) {
  const own = message.sender === mySide;
  const hasAction = canReply || canDelete;
  const [shiftY, setShiftY] = useState(0);
  const [cRect, setCRect] = useState<DOMRect | null>(null);
  // iOS: getBoundingClientRect (used for anchor/cRect) is in VISUAL-viewport
  // coords, but position:fixed is in LAYOUT-viewport coords. With the keyboard up
  // they differ by visualViewport.offsetTop, which made the whole overlay fly up.
  // Init SYNCHRONOUSLY (not via an effect) so the first paint is already at the
  // right spot — otherwise the clone animates `top` from 0 ("falls from above").
  const [vvTop] = useState(() =>
    typeof window !== "undefined" ? window.visualViewport?.offsetTop ?? 0 : 0
  );
  const [show, setShow] = useState(false);
  const [listRect, setListRect] = useState<DOMRect | null>(null);
  // A message taller than the available menu area is shown in a *scrollable*
  // clone (Telegram-style): the big bubble can be panned up/down with a bounce
  // while the chat behind stays frozen; reactions sit over its bottom edge,
  // actions below. On close we sync the real chat scroll to wherever the user
  // left off inside the clone.
  const [tooTall, setTooTall] = useState(false);
  const scrollBoxRef = useRef<HTMLDivElement | null>(null); // the scrollable clone
  const listElRef = useRef<HTMLElement | null>(null); // the real .chat-scroll list
  const listTopAtOpen = useRef(0); // its scrollTop when the menu opened
  const listRectTopAtOpen = useRef(0); // its viewport top when the menu opened

  // Enter on next frame; `show` drives the open/close transitions.
  useEffect(() => {
    const r = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(r);
  }, []);

  // Animate out, then actually unmount. Reveal the original immediately so the
  // fading clone overlaps it (no empty-gap flash).
  const close = (fn?: () => void) => {
    fn?.();
    // Big-message mode: leave the real chat scrolled to whatever part of the
    // message the user was reading inside the clone. The content at the clone's
    // top edge (scrolled by menuScroll) is mapped to the top of the real list.
    // All terms are visual-viewport coords, so the vvTop offset cancels out.
    if (tooTall && listElRef.current) {
      const menuScroll = scrollBoxRef.current?.scrollTop ?? 0;
      listElRef.current.scrollTop =
        listTopAtOpen.current + (anchor.top - listRectTopAtOpen.current) + menuScroll;
    }
    onClosing?.();
    setShow(false);
    setTimeout(onClose, ANIM);
  };

  useLayoutEffect(() => {
    const c = container?.getBoundingClientRect() ?? null;
    setCRect(c);
    if (!c) return;
    // Remember the real scroll list so we can restore the reading position on exit.
    const list = container?.querySelector(".chat-scroll") as HTMLElement | null;
    listElRef.current = list;
    listTopAtOpen.current = list?.scrollTop ?? 0;
    const lr = list?.getBoundingClientRect() ?? null;
    setListRect(lr);
    listRectTopAtOpen.current = lr?.top ?? c.top;
    let s = 0;
    const minTop = c.top + 10 + MENU_H + GAP;
    if (anchor.top + s < minTop) s = minTop - anchor.top;
    const maxBottom = c.bottom - 10 - (hasAction ? REPLY_H + GAP : 0);
    if (anchor.bottom + s > maxBottom) s -= anchor.bottom + s - maxBottom;
    if (anchor.top + s < minTop) s = minTop - anchor.top;
    setShiftY(s);
    // Doesn't fit even after shifting -> switch to the scrollable big-message mode.
    setTooTall(anchor.height > maxBottom - minTop);
  }, [anchor, container, canReply, hasAction]);

  // Big-message mode: start the clone scrolled to the bottom edge of the message
  // (matches Telegram — you land on the end, then pan up through the history).
  useLayoutEffect(() => {
    if (tooTall && scrollBoxRef.current) {
      scrollBoxRef.current.scrollTop = scrollBoxRef.current.scrollHeight;
    }
  }, [tooTall]);

  const bubbleTop = anchor.top + shiftY;
  const sideStyle: React.CSSProperties = own
    ? { right: Math.max(8, window.innerWidth - anchor.right) }
    : { left: anchor.left };

  const pop = "transition-[opacity,transform] duration-150 ease-out";
  const popState = show ? "scale-100 opacity-100" : "scale-90 opacity-0";

  // Big-message geometry (only used when tooTall): the scroll window is confined
  // to the message-LIST area (.chat-scroll), NOT the whole pane — so the big
  // clone never covers the sticky header (above the list) or the blurred input
  // (below it). Reactions float over the clone's bottom edge; the actions sit at
  // the list's bottom edge, above the composer (so they never slide under the
  // browser's bottom bar). Only this menu — never the clone — overlaps the input.
  const bigBox = listRect ?? cRect;
  const winTop = bigBox ? bigBox.top + GAP : 0;
  const actionTopBig = bigBox ? bigBox.bottom - REPLY_H : 0;
  const winBottom = actionTopBig - GAP;
  const winHeight = winBottom - winTop;
  const reactionsTopBig = winBottom - MENU_H; // overlaps the bubble's bottom edge

  const reactionBar = (style: React.CSSProperties) => (
    <div
      className={cn("fixed z-[201] flex gap-1 rounded-full border border-bg-border bg-bg-soft px-2 py-1.5 shadow-xl", pop, popState)}
      style={style}
    >
      {REACTION_EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => close(() => onReact(message.id, e))}
          className="text-xl leading-none transition-transform hover:scale-125 active:scale-110"
        >
          {e}
        </button>
      ))}
    </div>
  );

  const actionBtn = (style: React.CSSProperties) =>
    hasAction ? (
      <button
        type="button"
        onClick={() => close(() => (canDelete ? onDelete(message.id) : onReply(message.id)))}
        className={cn(
          "fixed z-[201] flex items-center gap-1.5 rounded-lg border border-bg-border bg-bg-soft px-3 py-1.5 text-sm shadow-xl",
          pop,
          popState,
          canDelete ? "text-red-400" : "text-fg"
        )}
        style={style}
      >
        {canDelete ? (
          <>
            <Trash2 size={15} /> Удалить
          </>
        ) : (
          <>
            <Reply size={15} /> Ответить
          </>
        )}
      </button>
    ) : null;

  return (
    <>
      {/* Blur over the pane (also covers the input). Closing the menu must NOT
          blur the input (drop the keyboard) — preventDefault keeps the focus; the
          click still closes. A second tap (on the pane) then hides the keyboard. */}
      <div
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => close()}
        className={cn("fixed z-[190] bg-bg/40 backdrop-blur-[3px] transition-opacity duration-200", show ? "opacity-100" : "opacity-0")}
        style={
          cRect
            ? { top: cRect.top + vvTop, left: cRect.left, width: cRect.width, height: cRect.height }
            : { inset: 0 }
        }
      />

      {tooTall && cRect ? (
        <>
          {/* Scrollable big-message clone: pan it up/down (with bounce) while the
              chat behind stays frozen. .chat-scroll lets the touchmove guard pass. */}
          <div
            ref={scrollBoxRef}
            className={cn(
              "chat-scroll fixed z-[200] overflow-y-auto overscroll-contain transition-opacity duration-150 ease-out",
              show ? "opacity-100" : "opacity-0"
            )}
            style={{ top: winTop + vvTop, left: anchor.left, width: anchor.width, height: winHeight }}
          >
            <div className={cn("flex", own ? "justify-end" : "justify-start")}>
              <div className="max-w-full">
                <Bubble message={message} mySide={mySide} isRead={isRead} onReact={onReact} />
              </div>
            </div>
          </div>

          {/* Reactions over the bubble's bottom edge, actions just below. */}
          {reactionBar({ top: reactionsTopBig + vvTop, transformOrigin: "bottom", ...sideStyle })}
          {actionBtn({ top: actionTopBig + vvTop, transformOrigin: "top", ...sideStyle })}
        </>
      ) : (
        <>
          {/* Reaction picker above the message */}
          {reactionBar({ top: bubbleTop - GAP - MENU_H + vvTop, transformOrigin: "bottom", ...sideStyle })}

          {/* The lifted, crisp message */}
          <div
            className={cn("fixed z-[200] transition-[top,opacity,transform] duration-150 ease-out", show ? "opacity-100" : "opacity-0")}
            style={{ top: bubbleTop + vvTop, left: anchor.left, width: anchor.width }}
          >
            <div className={cn("flex", own ? "justify-end" : "justify-start")}>
              <div className="max-w-full">
                <Bubble message={message} mySide={mySide} isRead={isRead} onReact={onReact} />
              </div>
            </div>
          </div>

          {/* Action below: reply (others) or delete (own) */}
          {actionBtn({ top: anchor.bottom + shiftY + GAP + vvTop, transformOrigin: "top", ...sideStyle })}
        </>
      )}
    </>
  );
}
