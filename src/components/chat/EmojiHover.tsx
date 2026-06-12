"use client";

import { useRef, useState } from "react";
import { Smile } from "lucide-react";
import { cn } from "@/lib/utils";
import { COMPOSER_EMOJIS } from "./EmojiPicker";

// Desktop-only emoji control that lives inside the input's right edge. Opens on
// hover (no click), lets you pick several, and fades out when the cursor leaves.
export function EmojiHover({
  onPick,
  align = "right",
}: {
  onPick: (emoji: string) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  };

  return (
    <div className="relative hidden sm:block" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button
        type="button"
        aria-label="Эмодзи"
        className={cn("flex h-7 w-7 items-center justify-center rounded-md transition", open ? "text-accent" : "text-fg-faint hover:text-fg")}
      >
        <Smile size={18} />
      </button>
      <div
        className={cn(
          "chat-scroll absolute bottom-full mb-2 grid w-[15rem] grid-cols-8 gap-0.5 overflow-y-auto rounded-xl border border-bg-border bg-bg-soft p-2 shadow-xl transition-all duration-150",
          align === "left" ? "left-0 origin-bottom-left" : "right-0 origin-bottom-right",
          open ? "max-h-44 scale-100 opacity-100" : "pointer-events-none max-h-44 scale-95 opacity-0"
        )}
      >
        {COMPOSER_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick(e)}
            className="rounded p-1 text-xl leading-none transition hover:bg-bg-card"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
