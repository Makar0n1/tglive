"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Image as ImageIcon, FileText } from "lucide-react";

// Paperclip-style attach button (left of the input). Click opens a small menu
// (Photo / File). Keeps the keyboard open (onMouseDown preventDefault).
export function AttachButton({
  onFiles,
  align = "left",
}: {
  onFiles: (files: File[], kind: "image" | "file") => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  const pick = (kind: "image" | "file") => {
    setOpen(false);
    (kind === "image" ? photoRef : fileRef).current?.click();
  };

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button"
        aria-label="Прикрепить"
        // pointerdown preventDefault keeps the input focused (keyboard stays up)
        // and still lets the click open the menu — onMouseDown alone is unreliable
        // on iOS for non-input targets.
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className={cnBtn(open)}
      >
        <Plus size={20} className={open ? "rotate-45 transition-transform" : "transition-transform"} />
      </button>

      {open ? (
        <div className={`absolute bottom-11 ${align === "right" ? "right-0" : "left-0"} z-[120] w-40 animate-context-pop overflow-hidden rounded-xl border border-bg-border bg-bg-soft py-1 shadow-xl`}>
          <MenuItem icon={<ImageIcon size={16} className="text-accent" />} label="Фото" onClick={() => pick("image")} />
          <MenuItem icon={<FileText size={16} className="text-accent" />} label="Файл" onClick={() => pick("file")} />
        </div>
      ) : null}

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const f = Array.from(e.target.files || []);
          e.target.value = "";
          if (f.length) onFiles(f, "image");
        }}
      />
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const f = Array.from(e.target.files || []);
          e.target.value = "";
          if (f.length) onFiles(f, "file");
        }}
      />
    </div>
  );
}

function cnBtn(open: boolean) {
  return [
    "flex h-[38px] w-[38px] items-center justify-center rounded-lg transition-colors",
    open ? "text-accent" : "text-fg-faint hover:text-fg",
  ].join(" ");
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-fg transition-colors hover:bg-bg-card"
    >
      {icon}
      {label}
    </button>
  );
}
