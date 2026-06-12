"use client";

// Minimal emoji set for the composer.
export const COMPOSER_EMOJIS = [
  "😀", "😁", "😂", "🤣", "🙂", "😉", "😍", "😘",
  "😎", "🤔", "😏", "😴", "😢", "😭", "😡", "🥳",
  "👍", "👎", "🙏", "👏", "🤝", "💪", "🔥", "⭐",
  "🎉", "❤️", "💯", "✅", "❌", "👀", "🚀", "✨",
];

export function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-[120]" onClick={onClose} />
      <div className="chat-scroll absolute bottom-12 right-0 z-[121] grid max-h-44 w-[15rem] grid-cols-8 gap-0.5 overflow-y-auto rounded-xl border border-bg-border bg-bg-soft p-2 shadow-xl">
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
    </>
  );
}
