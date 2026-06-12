"use client";

import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Attachment } from "./chat-bus";
import type { ChatMsg } from "@/components/chat/ChatMessage";
import {
  uploadAttachment,
  chunk,
  validateFile,
  MAX_ATTACHMENTS,
  type UploadItem,
} from "./chat-media";

let seq = 0;
const uid = (p: string) => `${p}_${Date.now()}_${seq++}`;
const byTime = (a: ChatMsg, b: ChatMsg) => a.createdAt.localeCompare(b.createdAt);

interface ItemCtl {
  localId: string;
  canceled: boolean;
  attachment: Attachment | null;
  abort?: () => void;
}

// Manages: split selection into <=5-photo messages, upload each file
// sequentially (progress + cancel), then send the message. Caption goes on the
// LAST batch. Everything is sequential ("по очереди") and optimistic.
export function useChatAttachmentSend(opts: {
  uploadUrl: string;
  mySide: "VISITOR" | "ADMIN";
  setMessages: Dispatch<SetStateAction<ChatMsg[]>>;
  commit: (body: string, attachments: Attachment[], replyToId?: string) => Promise<ChatMsg | null>;
  onError?: (msg: string) => void;
}) {
  const { uploadUrl, mySide, setMessages, commit, onError } = opts;
  const ctls = useRef<Map<string, ItemCtl>>(new Map());

  const patch = useCallback(
    (clientKey: string, fn: (m: ChatMsg) => ChatMsg) => {
      setMessages((prev) => prev.map((m) => (m.clientKey === clientKey ? fn(m) : m)));
    },
    [setMessages]
  );

  const runBatch = useCallback(
    async (files: File[], caption: string, replyToId?: string) => {
      const clientKey = uid("att");
      const items: UploadItem[] = files.map((f) => ({
        localId: uid("u"),
        kind: f.type.startsWith("image/") ? "image" : "file",
        name: f.name,
        size: f.size,
        previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
        progress: 0,
        status: "uploading",
      }));
      const itemCtls = items.map<ItemCtl>((it) => ({
        localId: it.localId,
        canceled: false,
        attachment: null,
      }));
      itemCtls.forEach((c) => ctls.current.set(c.localId, c));

      const optimistic: ChatMsg = {
        id: clientKey,
        clientKey,
        sender: mySide,
        body: caption,
        createdAt: new Date().toISOString(),
        pending: true,
        attachments: [],
        uploads: items,
      };
      setMessages((prev) => [...prev, optimistic].sort(byTime));

      for (let i = 0; i < files.length; i++) {
        const item = items[i]!;
        const ctl = itemCtls[i]!;
        if (ctl.canceled) continue;
        const { promise, abort } = uploadAttachment(uploadUrl, files[i]!, (pct) => {
          patch(clientKey, (m) => ({
            ...m,
            uploads: m.uploads?.map((u) => (u.localId === item.localId ? { ...u, progress: pct } : u)),
          }));
        });
        ctl.abort = abort;
        try {
          ctl.attachment = await promise;
          patch(clientKey, (m) => ({
            ...m,
            uploads: m.uploads?.map((u) =>
              u.localId === item.localId ? { ...u, progress: 100, status: "done" } : u
            ),
          }));
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") {
            patch(clientKey, (m) => ({
              ...m,
              uploads: m.uploads?.filter((u) => u.localId !== item.localId),
            }));
          } else {
            ctl.canceled = true;
            patch(clientKey, (m) => ({
              ...m,
              uploads: m.uploads?.map((u) =>
                u.localId === item.localId ? { ...u, status: "error" } : u
              ),
            }));
            onError?.(e instanceof Error ? e.message : "Не удалось загрузить");
          }
        } finally {
          ctls.current.delete(item.localId);
        }
      }

      items.forEach((u) => u.previewUrl && URL.revokeObjectURL(u.previewUrl));
      const attachments = itemCtls
        .filter((c) => !c.canceled && c.attachment)
        .map((c) => c.attachment!) as Attachment[];

      if (attachments.length === 0) {
        setMessages((prev) => prev.filter((m) => m.clientKey !== clientKey));
        return;
      }

      const real = await commit(caption, attachments, replyToId);
      setMessages((prev) => {
        const hasReal = real && prev.some((x) => x.id === real.id);
        // Remove ONLY the still-optimistic row (its id === clientKey). If the
        // SSE already reconciled it (id became the real id), leave it — filtering
        // by clientKey here would wrongly delete the persisted message.
        const without = prev.filter((x) => x.id !== clientKey);
        if (real && !hasReal) return [...without, { ...real, clientKey }].sort(byTime);
        return without;
      });
    },
    [uploadUrl, mySide, setMessages, commit, onError, patch]
  );

  const sendFiles = useCallback(
    (files: File[], caption: string, replyToId?: string) => {
      const valid: File[] = [];
      for (const f of files) {
        const err = validateFile(f);
        if (err) onError?.(err);
        else valid.push(f);
      }
      if (valid.length === 0) return;
      const batches = chunk(valid, MAX_ATTACHMENTS);
      // Sequential batches -> stable order; caption on the last, reply on the first.
      void (async () => {
        for (let i = 0; i < batches.length; i++) {
          await runBatch(
            batches[i]!,
            i === batches.length - 1 ? caption : "",
            i === 0 ? replyToId : undefined
          );
        }
      })();
    },
    [runBatch, onError]
  );

  const cancelUpload = useCallback(
    (localId: string) => {
      const ctl = ctls.current.get(localId);
      if (ctl) {
        ctl.canceled = true;
        ctl.abort?.();
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.uploads ? { ...m, uploads: m.uploads.filter((u) => u.localId !== localId) } : m
        )
      );
    },
    [setMessages]
  );

  return { sendFiles, cancelUpload };
}
