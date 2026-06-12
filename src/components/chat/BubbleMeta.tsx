import { ReadTicks } from "./ReadTicks";

// Telegram-style meta (time + ticks): sits on the last text line when it fits,
// otherwise drops to its own line. Achieved with an invisible inline spacer
// that reserves exactly the meta's width on the last line, plus the real meta
// absolutely positioned in the bottom-right corner. The parent bubble must be
// `relative` and have bottom padding room.
export function BubbleMeta({
  time,
  showTicks,
  read,
  pending,
}: {
  time: string;
  showTicks: boolean;
  read: boolean;
  pending?: boolean;
}) {
  const meta = (
    <>
      <span>{time}</span>
      {showTicks ? <ReadTicks read={read} pending={pending} /> : null}
    </>
  );
  return (
    <>
      <span
        aria-hidden
        className="invisible ml-2 inline-flex select-none items-center gap-1 align-bottom text-xs leading-none"
      >
        {meta}
      </span>
      <span className="absolute bottom-[11px] right-3 flex items-center gap-1 text-xs leading-none opacity-60">
        {meta}
      </span>
    </>
  );
}
