"use client";

import { Reply, X } from "lucide-react";

// Reply preview shown above the composer. Telegram-style: reply arrow, a blue
// bar, the message's first line (ellipsised), and a cancel cross.
export function ReplyBar({
  body,
  onCancel,
}: {
  body: string;
  onCancel: () => void;
}) {
  const firstLine = body.split("\n")[0] ?? "";
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg bg-bg/60 py-1.5 pl-2 pr-1.5 animate-fade-in">
      <Reply size={16} className="shrink-0 text-accent" />
      <div className="min-w-0 flex-1 border-l-2 border-accent pl-2">
        <p className="text-[11px] font-medium leading-none text-accent">Ответ на сообщение</p>
        <p className="mt-0.5 truncate text-sm text-fg-muted">{firstLine}</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        // Don't steal focus from the input -> the keyboard stays open.
        onMouseDown={(e) => e.preventDefault()}
        aria-label="Отменить ответ"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-faint hover:text-fg"
      >
        <X size={16} />
      </button>
    </div>
  );
}
