"use client";

import { useEffect, useRef, type RefObject } from "react";
import { cn } from "@/lib/utils";

// Auto-growing message input:
// - grows with content up to `maxRows`, then scrolls (grows upward because the
//   composer is anchored to the bottom);
// - Enter sends; Shift/Ctrl/Cmd+Enter inserts a newline at the caret.
export function AutoTextarea({
  value,
  onChange,
  onSubmit,
  onFocus,
  placeholder,
  className,
  maxRows = 3,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onFocus?: () => void;
  placeholder?: string;
  className?: string;
  maxRows?: number;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? innerRef;
  const caret = useRef<number | null>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    const cs = window.getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 20;
    const padTop = parseFloat(cs.paddingTop) || 0;
    const padBottom = parseFloat(cs.paddingBottom) || 0;
    const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const max = line * maxRows + padTop + padBottom + border;

    el.style.height = "auto";
    // box-sizing is border-box, so add the border to show the full content
    // (single row -> 38px, matching the send button).
    const fit = el.scrollHeight + border;
    el.style.height = `${Math.min(fit, max)}px`;
    el.style.overflowY = fit > max ? "auto" : "hidden";

    // Scroll only if the caret is OUT of the visible viewport. Otherwise leave
    // the scroll position exactly where it is (editing a visible line shouldn't
    // jump). When off-screen: last line -> stick to bottom; otherwise centre it.
    const caretPos = el.selectionStart;
    const row = el.value.slice(0, caretPos).split("\n").length - 1;
    const totalLines = el.value.split("\n").length;
    const caretTop = padTop + row * line;
    const caretBottom = caretTop + line;

    const viewTop = el.scrollTop;
    const viewBottom = el.scrollTop + el.clientHeight;
    const visible = caretTop >= viewTop && caretBottom <= viewBottom;
    if (visible) return;

    const maxScroll = el.scrollHeight - el.clientHeight;
    let next: number;
    if (row >= totalLines - 1) {
      next = maxScroll; // last line -> bottom
    } else {
      next = caretTop + line / 2 - el.clientHeight / 2; // centre caret line
    }
    el.scrollTop = Math.max(0, Math.min(next, maxScroll));
  };

  // On value change: restore caret first (for programmatic newline inserts),
  // then resize + conditionally scroll.
  useEffect(() => {
    if (caret.current !== null && ref.current) {
      ref.current.selectionStart = ref.current.selectionEnd = caret.current;
      caret.current = null;
    }
    resize();
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  function insertNewline() {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    caret.current = start + 1;
    onChange(value.slice(0, start) + "\n" + value.slice(end));
  }

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      placeholder={placeholder}
      onFocus={onFocus}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        if (e.shiftKey) return; // browser inserts a newline natively
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault(); // force a newline (browsers don't by default)
          insertNewline();
          return;
        }
        e.preventDefault();
        onSubmit();
      }}
      className={cn("chat-scroll resize-none", className)}
    />
  );
}
