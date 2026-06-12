import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./uploads";

const MIME: Record<string, string> = {
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".svg": "image/svg+xml",
};

// Serves uploaded files from the storage volume. In production nginx serves
// /uploads directly; this handler is the dev + fallback path.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: parts } = await params;
  const root = path.resolve(UPLOADS_DIR);
  const target = path.resolve(root, ...parts);

  // Prevent path traversal outside the uploads root.
  if (!target.startsWith(root + path.sep) && target !== root) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const data = await fs.readFile(target);
    const ext = path.extname(target).toLowerCase();
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=2592000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
