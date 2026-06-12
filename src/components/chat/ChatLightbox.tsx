"use client";

import { useCallback, useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { Attachment } from "@/lib/chat-bus";

// Fullscreen image viewer for chat photos. Arrows / swipe to navigate.
export function ChatLightbox({
  images,
  index,
  onClose,
}: {
  images: Attachment[];
  index: number;
  onClose: () => void;
}) {
  const [i, setI] = useState(index);
  const prev = useCallback(() => setI((v) => Math.max(0, v - 1)), []);
  const next = useCallback(() => setI((v) => Math.min(images.length - 1, v + 1)), [images.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);

  const cur = images[i];
  if (!cur) return null;

  let sx = 0;
  let sy = 0;
  return (
    <div
      data-chat-lightbox
      className="absolute inset-0 z-[160] flex animate-fade-in items-center justify-center overflow-hidden bg-black/95 p-4 sm:p-10"
      onClick={onClose}
      onTouchStart={(e) => {
        sx = e.touches[0]!.clientX;
        sy = e.touches[0]!.clientY;
      }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0]!.clientX - sx;
        const dy = e.changedTouches[0]!.clientY - sy;
        // Vertical swipe (up or down) -> close. Horizontal -> prev/next.
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 70) {
          onClose();
        } else if (dx > 50) {
          prev();
        } else if (dx < -50) {
          next();
        }
      }}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 text-white/80 hover:text-white"
        aria-label="Закрыть"
      >
        <X size={28} />
      </button>
      <a
        href={cur.url}
        download={cur.name}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="absolute left-4 top-4 text-white/80 hover:text-white"
        aria-label="Скачать"
      >
        <Download size={24} />
      </a>

      {i > 0 ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
          className="absolute left-2 hidden text-white/70 hover:text-white sm:block"
          aria-label="Назад"
        >
          <ChevronLeft size={40} />
        </button>
      ) : null}
      {i < images.length - 1 ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
          className="absolute right-2 hidden text-white/70 hover:text-white sm:block"
          aria-label="Вперёд"
        >
          <ChevronRight size={40} />
        </button>
      ) : null}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cur.url}
        alt={cur.name}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-sm object-contain"
      />

      {images.length > 1 ? (
        <span className="absolute bottom-5 text-sm text-white/70">
          {i + 1} / {images.length}
        </span>
      ) : null}
    </div>
  );
}
