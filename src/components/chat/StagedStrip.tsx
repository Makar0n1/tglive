"use client";

import { X, FileText } from "lucide-react";

export interface StagedFile {
  id: string;
  file: File;
  previewUrl?: string; // object URL for images
}

// Telegram-style "about to send" strip above the composer: thumbnails / file
// chips with a remove cross. Caption is the input text; press send to upload.
export function StagedStrip({
  files,
  onRemove,
}: {
  files: StagedFile[];
  onRemove: (id: string) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
      {files.map((s) => (
        <div
          key={s.id}
          className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-bg-border bg-bg"
        >
          {s.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 p-1 text-fg-faint">
              <FileText size={18} />
              <span className="w-full truncate text-center text-[9px] leading-tight">{s.file.name}</span>
            </div>
          )}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onRemove(s.id)}
            aria-label="Убрать"
            className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/65 text-white"
          >
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}
