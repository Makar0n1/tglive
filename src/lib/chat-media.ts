"use client";

import type { Attachment } from "./chat-bus";

export const MAX_ATTACHMENTS = 5; // per message; more -> split into messages
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

// One pending upload shown inside an optimistic message (circle % + cancel).
export interface UploadItem {
  localId: string;
  kind: "image" | "file";
  name: string;
  size: number;
  previewUrl?: string; // object URL for images
  progress: number; // 0..100
  status: "uploading" | "done" | "error";
}

export const fileKind = (f: File): "image" | "file" =>
  f.type.startsWith("image/") ? "image" : "file";

export function validateFile(f: File): string | null {
  const isImage = f.type.startsWith("image/");
  const limit = isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
  if (f.size > limit) return isImage ? `«${f.name}» больше 5 МБ` : `«${f.name}» больше 10 МБ`;
  return null;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
}

// Upload a single file with progress + abort (fetch can't report upload %).
export function uploadAttachment(
  url: string,
  file: File,
  onProgress: (pct: number) => void
): { promise: Promise<Attachment>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<Attachment>((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 95));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.attachment) resolve(data.attachment as Attachment);
          else reject(new Error(data.error || "Не удалось загрузить"));
        } catch {
          reject(new Error("Некорректный ответ"));
        }
      } else {
        let msg = "Не удалось загрузить";
        try {
          msg = JSON.parse(xhr.responseText).error || msg;
        } catch {
          /* ignore */
        }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Сеть недоступна"));
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}
