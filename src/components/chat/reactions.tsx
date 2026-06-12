"use client";

import { cn } from "@/lib/utils";
import type { Reaction } from "@/lib/chat-bus";

// Minimal Telegram-style reaction set.
export const REACTION_EMOJIS = ["👍", "❤️", "🔥", "😂", "😮", "🙏"];

type Side = "VISITOR" | "ADMIN";

// Optimistic local toggle (mirrors the server logic) for snappy UI.
export function applyReactionToggle(reactions: Reaction[], by: Side, emoji: string): Reaction[] {
  const mine = reactions.find((r) => r.by === by);
  if (mine && mine.emoji === emoji) return reactions.filter((r) => r.by !== by);
  return [...reactions.filter((r) => r.by !== by), { emoji, by }];
}

function group(reactions: Reaction[], mySide: Side) {
  const map = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const cur = map.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.by === mySide) cur.mine = true;
    map.set(r.emoji, cur);
  }
  return Array.from(map, ([emoji, v]) => ({ emoji, ...v }));
}

// Popover with the reaction choices (appears above the bubble). The caller is
// responsible for the click-away backdrop.
export function ReactionPicker({
  onPick,
  align,
}: {
  onPick: (emoji: string) => void;
  align: "end" | "start";
}) {
  return (
    <div
      className={cn(
        "absolute -top-12 z-[121] flex gap-1 rounded-full border border-bg-border bg-bg-soft px-2 py-1.5 shadow-xl",
        align === "end" ? "right-0" : "left-0"
      )}
    >
      {REACTION_EMOJIS.map((e, i) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          style={{ animationDelay: `${i * 30}ms` }}
          className="animate-reaction-pop text-xl leading-none transition-transform hover:scale-125"
        >
          {e}
        </button>
      ))}
    </div>
  );
}

// Reaction pills shown under a bubble. Click toggles your own reaction.
export function ReactionPills({
  reactions,
  mySide,
  align,
  onToggle,
}: {
  reactions: Reaction[];
  mySide: Side;
  align: "end" | "start";
  onToggle: (emoji: string) => void;
}) {
  const groups = group(reactions, mySide);
  if (groups.length === 0) return null;
  return (
    <div className={cn("mt-1 flex flex-wrap gap-1", align === "end" ? "justify-end" : "justify-start")}>
      {groups.map((g) => (
        <button
          key={g.emoji}
          type="button"
          onClick={() => onToggle(g.emoji)}
          className={cn(
            "flex animate-reaction-pop items-center gap-0.5 rounded-full px-1.5 py-0.5 leading-none transition",
            g.mine
              ? "bg-accent/20 text-accent ring-1 ring-accent/40"
              : "bg-bg-card text-fg-muted hover:bg-bg-border"
          )}
        >
          <span className="text-sm">{g.emoji}</span>
          {g.count > 1 ? <span className="text-[11px] font-medium">{g.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
