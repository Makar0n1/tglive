import "server-only";
import { LocalStorageAdapter } from "./local";
import type { StorageAdapter } from "./types";

export type { StorageAdapter, StoredObject } from "./types";

// Single place to choose the backend. To switch to S3 later, implement an
// S3StorageAdapter and select it here (e.g. via env STORAGE_DRIVER).
let adapter: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (!adapter) {
    adapter = new LocalStorageAdapter();
  }
  return adapter;
}
