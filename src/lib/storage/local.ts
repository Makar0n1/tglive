import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import type { StorageAdapter, StoredObject } from "./types";

const MAX_DIMENSION = 2400; // cap very large uploads
// Where uploaded files live on disk, and the public URL prefix they're served
// under (see app/uploads/[...path]/route.ts, or point nginx at the same folder).
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./uploads";
const UPLOADS_PUBLIC_PREFIX = process.env.UPLOADS_PUBLIC_PREFIX ?? "/uploads";

function yearMonthDir(): string {
  const now = new Date();
  return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function randomName(): string {
  return crypto.randomBytes(8).toString("hex");
}

export class LocalStorageAdapter implements StorageAdapter {
  private root = path.resolve(UPLOADS_DIR);
  private prefix = UPLOADS_PUBLIC_PREFIX.replace(/\/$/, "");

  private async ensureDir(rel: string) {
    await fs.mkdir(path.join(this.root, rel), { recursive: true });
  }

  async saveImage(buffer: Buffer, _originalName: string): Promise<StoredObject> {
    const dir = yearMonthDir();
    await this.ensureDir(dir);

    const pipeline = sharp(buffer, { failOn: "none" }).rotate();
    const meta = await pipeline.metadata();

    // Downscale oversized images, convert to webp for size/quality balance.
    const resized = pipeline.resize({
      width: Math.min(meta.width ?? MAX_DIMENSION, MAX_DIMENSION),
      withoutEnlargement: true,
    });
    const out = await resized.webp({ quality: 82 }).toBuffer({ resolveWithObject: true });

    const key = `${dir}/${randomName()}.webp`;
    await fs.writeFile(path.join(this.root, key), out.data);

    return {
      key,
      url: `${this.prefix}/${key}`,
      mimeType: "image/webp",
      width: out.info.width,
      height: out.info.height,
      size: out.info.size,
    };
  }

  async saveRaw(buffer: Buffer, originalName: string, mimeType: string): Promise<StoredObject> {
    const dir = yearMonthDir();
    await this.ensureDir(dir);
    const ext = path.extname(originalName) || "";
    const key = `${dir}/${randomName()}${ext}`;
    await fs.writeFile(path.join(this.root, key), buffer);
    return {
      key,
      url: `${this.prefix}/${key}`,
      mimeType,
      size: buffer.length,
    };
  }

  async delete(key: string): Promise<void> {
    await fs.unlink(path.join(this.root, key)).catch(() => {});
  }
}
