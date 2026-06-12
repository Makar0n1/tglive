import "server-only";
import { getStorage } from "./storage";
import type { Attachment } from "./chat-bus";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per photo
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file

export type UploadResult =
  | { ok: true; attachment: Attachment }
  | { ok: false; status: number; error: string };

// Validate + persist one chat attachment. Images (except GIF) are resized to
// webp; GIFs and other files are stored as-is.
export async function processChatUpload(file: File): Promise<UploadResult> {
  const isImage = file.type.startsWith("image/");
  const isGif = file.type === "image/gif";
  const limit = isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
  if (file.size > limit) {
    return {
      ok: false,
      status: 413,
      error: isImage ? "Фото больше 5 МБ" : "Файл больше 10 МБ",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storage = getStorage();

  if (isImage) {
    // GIF -> keep as-is (preserve animation); other images -> webp.
    const stored = isGif
      ? await storage.saveRaw(buffer, file.name, file.type)
      : await storage.saveImage(buffer, file.name);
    return {
      ok: true,
      attachment: {
        type: "image",
        url: stored.url,
        name: file.name || "image",
        size: stored.size ?? file.size,
        mime: stored.mimeType,
        width: stored.width,
        height: stored.height,
      },
    };
  }

  const stored = await storage.saveRaw(
    buffer,
    file.name || "file",
    file.type || "application/octet-stream"
  );
  return {
    ok: true,
    attachment: {
      type: "file",
      url: stored.url,
      name: file.name || "file",
      size: stored.size ?? file.size,
      mime: stored.mimeType,
    },
  };
}
