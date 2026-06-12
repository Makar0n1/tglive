import { Check, CheckCheck } from "lucide-react";

// Message status as ticks only (no words). Colour/opacity from the parent.
// A single check shows immediately (no "pending clock" — it read like a loading
// spinner); double check once the other side has read it.
export function ReadTicks({ read }: { read: boolean; pending?: boolean }) {
  if (!read) return <Check size={13} strokeWidth={2.5} />;
  return <CheckCheck size={14} strokeWidth={2.5} />;
}
