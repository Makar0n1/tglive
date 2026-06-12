"use client";

import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Wraps a bubble and plays a Telegram-like dissolve: the bubble fades + blurs
// while a cloud of small particles scatters outward.
export function Dissolve({ accent, children }: { accent: boolean; children: ReactNode }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 28 }, () => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        dx: (Math.random() * 2 - 1) * 44,
        dy: (Math.random() * 2 - 1) * 30 - 12,
        size: 3 + Math.random() * 3,
        delay: Math.random() * 120,
      })),
    []
  );

  return (
    <div className="pointer-events-none relative">
      <div style={{ animation: "dissolve-fade 0.5s ease-out forwards" }}>{children}</div>
      <div className="absolute inset-0 overflow-visible">
        {particles.map((p, i) => (
          <span
            key={i}
            className={cn("absolute rounded-[1px]", accent ? "bg-accent" : "bg-fg-muted")}
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: p.size,
              height: p.size,
              // CSS custom props for the per-particle scatter direction.
              ["--dx" as string]: `${p.dx}px`,
              ["--dy" as string]: `${p.dy}px`,
              animation: "dissolve-particle 0.55s ease-out forwards",
              animationDelay: `${p.delay}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
