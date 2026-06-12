// Storage adapter contract. The local implementation writes to a mounted
// volume; swap for an S3 adapter later without touching call sites.

export interface StoredObject {
  key: string;
  url: string;
  mimeType: string;
  width?: number;
  height?: number;
  size?: number;
}

export interface StorageAdapter {
  // Process + persist an image buffer. Returns the canonical stored object.
  saveImage(buffer: Buffer, originalName: string): Promise<StoredObject>;
  // Persist a non-image file (video/gif) as-is.
  saveRaw(buffer: Buffer, originalName: string, mimeType: string): Promise<StoredObject>;
  delete(key: string): Promise<void>;
}
