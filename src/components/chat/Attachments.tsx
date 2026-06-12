"use client";

import { FileText, X, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { CircularProgress } from "./CircularProgress";
import { formatBytes, type UploadItem } from "@/lib/chat-media";
import type { Attachment } from "@/lib/chat-bus";

// Telegram-like photo grid for 2+ images: odd counts (3,5) lead with a wide
// hero, the rest in a 2-col grid.
function tileSpan(count: number, i: number): string {
  if ((count === 3 || count === 5) && i === 0) return "col-span-2 aspect-[2/1]";
  return "aspect-square";
}

// Single-image box aspect, clamped so very tall/wide photos stay sane. The full
// image is shown contained over a blurred cover of itself.
function singleRatio(w?: number, h?: number): number {
  const r = w && h ? w / h : 4 / 3;
  return Math.max(0.72, Math.min(1.7, r));
}

const blurBg = "absolute inset-0 h-full w-full scale-110 object-cover blur-lg";
const contain = "relative z-[1] h-full w-full object-contain";

export function Attachments({
  attachments,
  uploads,
  own,
  onCancel,
  onOpenImage,
}: {
  attachments?: Attachment[];
  uploads?: UploadItem[];
  own: boolean;
  onCancel?: (localId: string) => void;
  onOpenImage?: (images: Attachment[], index: number) => void;
}) {
  // ---- Uploading state (optimistic) ----
  if (uploads && uploads.length > 0) {
    const imgs = uploads.filter((u) => u.kind === "image");
    const files = uploads.filter((u) => u.kind === "file");
    return (
      <div className="flex flex-col gap-1">
        {imgs.length === 1 ? (
          <div className="relative w-full overflow-hidden rounded-[14px] bg-black/30" style={{ aspectRatio: "4 / 3" }}>
            {imgs[0]!.previewUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgs[0]!.previewUrl} alt="" aria-hidden className={blurBg} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgs[0]!.previewUrl} alt="" className={contain} />
              </>
            ) : null}
            <Overlay item={imgs[0]!} onCancel={onCancel} />
          </div>
        ) : imgs.length > 1 ? (
          <div className="grid w-full grid-cols-2 gap-0.5 overflow-hidden rounded-[14px]">
            {imgs.map((u, i) => (
              <div key={u.localId} className={cn("relative overflow-hidden bg-black/30", tileSpan(imgs.length, i))}>
                {u.previewUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u.previewUrl} alt="" aria-hidden className={blurBg} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u.previewUrl} alt="" className={contain} />
                  </>
                ) : null}
                <Overlay item={u} onCancel={onCancel} />
              </div>
            ))}
          </div>
        ) : null}
        {files.map((u) => (
          <div key={u.localId} className={cn("flex w-full items-center gap-2 rounded-lg px-1 py-1", own ? "bg-white/10" : "bg-black/20")}>
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
              {u.status === "error" ? (
                <FileText size={18} className="text-red-300" />
              ) : (
                <>
                  <CircularProgress value={u.progress} size={36} />
                  {onCancel ? (
                    <button type="button" onClick={() => onCancel(u.localId)} onMouseDown={(e) => e.preventDefault()} className="absolute text-white" aria-label="Отменить">
                      <X size={14} />
                    </button>
                  ) : null}
                </>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{u.name}</p>
              <p className="text-[10px] opacity-70">{u.status === "error" ? "не загружено" : formatBytes(u.size)}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ---- Final attachments ----
  if (!attachments || attachments.length === 0) return null;
  const images = attachments.filter((a) => a.type === "image");
  const files = attachments.filter((a) => a.type === "file");

  return (
    <div className="flex flex-col gap-1">
      {images.length === 1 ? (
        <button
          type="button"
          onClick={() => onOpenImage?.(images, 0)}
          onMouseDown={(e) => e.preventDefault()}
          className="relative block w-full overflow-hidden rounded-[14px] bg-black/30"
          style={{ aspectRatio: singleRatio(images[0]!.width, images[0]!.height) }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[0]!.url} alt="" aria-hidden className={blurBg} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[0]!.url} alt={images[0]!.name} className={contain} />
        </button>
      ) : images.length > 1 ? (
        <div className="grid w-full grid-cols-2 gap-0.5 overflow-hidden rounded-[14px]">
          {images.map((a, i) => (
            <button
              key={a.url + i}
              type="button"
              onClick={() => onOpenImage?.(images, i)}
              onMouseDown={(e) => e.preventDefault()}
              className={cn("relative overflow-hidden bg-black/30", tileSpan(images.length, i))}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt="" aria-hidden className={blurBg} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt={a.name} loading="lazy" className={contain} />
            </button>
          ))}
        </div>
      ) : null}
      {files.map((a, i) => (
        <a
          key={a.url + i}
          href={a.url}
          download={a.name}
          target="_blank"
          rel="noopener noreferrer"
          onMouseDown={(e) => e.preventDefault()}
          className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 transition-colors", own ? "bg-white/10 hover:bg-white/20" : "bg-black/20 hover:bg-black/30")}
        >
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", own ? "bg-white/15" : "bg-accent/20 text-accent")}>
            <FileText size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{a.name}</p>
            <p className="text-[10px] opacity-70">{formatBytes(a.size)}</p>
          </div>
          <Download size={15} className="shrink-0 opacity-60" />
        </a>
      ))}
    </div>
  );
}

function Overlay({ item, onCancel }: { item: UploadItem; onCancel?: (localId: string) => void }) {
  return (
    <div className="absolute inset-0 z-[2] flex items-center justify-center bg-black/40">
      {item.status === "error" ? (
        <span className="text-xs text-red-300">ошибка</span>
      ) : (
        <div className="relative flex items-center justify-center">
          <CircularProgress value={item.progress} />
          {onCancel ? (
            <button type="button" onClick={() => onCancel(item.localId)} onMouseDown={(e) => e.preventDefault()} className="absolute text-white" aria-label="Отменить">
              <X size={16} />
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
