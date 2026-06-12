import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4 lg:mb-6">
      {/* Hidden on mobile — the sticky top bar already shows the section name. */}
      <div className="hidden lg:block">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-bg-border bg-bg-soft p-5", className)}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, href }: { label: string; value: ReactNode; href?: string }) {
  const inner = (
    <div className="rounded-xl border border-bg-border bg-bg-soft p-5 transition hover:border-accent/40">
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-fg">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-bg-border py-16 text-center">
      <p className="text-fg-muted">{title}</p>
      {hint ? <p className="mt-1 text-sm text-fg-faint">{hint}</p> : null}
    </div>
  );
}

const buttonVariants = {
  primary: "bg-accent text-white hover:bg-accent/90",
  secondary: "border border-bg-border text-fg hover:border-accent/50",
  danger: "border border-red-500/40 text-red-400 hover:bg-red-500/10",
  ghost: "text-fg-muted hover:text-fg",
};

export function buttonClass(variant: keyof typeof buttonVariants = "primary", className?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50",
    buttonVariants[variant],
    className
  );
}

const badgeStyles: Record<string, string> = {
  DRAFT: "bg-yellow-500/15 text-yellow-400",
  PUBLISHED: "bg-green-500/15 text-green-400",
  NEW: "bg-accent/15 text-accent",
  IN_PROGRESS: "bg-yellow-500/15 text-yellow-400",
  CLOSED: "bg-bg-card text-fg-faint",
};

const badgeLabels: Record<string, string> = {
  DRAFT: "Черновик",
  PUBLISHED: "Опубликован",
  NEW: "Новая",
  IN_PROGRESS: "В работе",
  CLOSED: "Закрыта",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        badgeStyles[status] ?? "bg-bg-card text-fg-muted"
      )}
    >
      {badgeLabels[status] ?? status}
    </span>
  );
}
