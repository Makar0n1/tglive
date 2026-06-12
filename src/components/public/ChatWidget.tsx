"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AutoTextarea } from "@/components/chat/AutoTextarea";
import { EmojiHover } from "@/components/chat/EmojiHover";
import { ReplyBar } from "@/components/chat/ReplyBar";
import { ChatMessage, type ChatMsg } from "@/components/chat/ChatMessage";
import { MessageOverlay } from "@/components/chat/MessageOverlay";
import { AttachButton } from "@/components/chat/AttachButton";
import { ChatLightbox } from "@/components/chat/ChatLightbox";
import { StagedStrip, type StagedFile } from "@/components/chat/StagedStrip";
import { applyReactionToggle } from "@/components/chat/reactions";
import { sanitizeChatBody } from "@/lib/chat-text";
import { useChatAttachmentSend } from "@/lib/useChatAttachmentSend";
import { validateFile } from "@/lib/chat-media";
import type { Reaction, Attachment } from "@/lib/chat-bus";
import { MessageCircle, X, Bell, BellOff, Send, ChevronDown } from "lucide-react";

type Msg = ChatMsg;

function useBeep() {
  const ctxRef = useRef<AudioContext | null>(null);
  return useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = ctxRef.current ?? new Ctx();
      const ctx = ctxRef.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      o.start();
      o.stop(ctx.currentTime + 0.26);
    } catch {
      /* autoplay blocked */
    }
  }, []);
}

function useTitleAlert(active: boolean, text: string) {
  useEffect(() => {
    if (!active) return;
    const original = document.title;
    let on = false;
    const id = setInterval(() => {
      if (!document.hidden) return;
      document.title = on ? original : text;
      on = !on;
    }, 1000);
    const restore = () => {
      if (!document.hidden) document.title = original;
    };
    document.addEventListener("visibilitychange", restore);
    return () => {
      clearInterval(id);
      document.title = original;
      document.removeEventListener("visibilitychange", restore);
    };
  }, [active, text]);
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [panelRender, setPanelRender] = useState(false); // in DOM (kept during exit)
  const [panelShown, setPanelShown] = useState(false); // animation state
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [unread, setUnread] = useState(0);
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [identified, setIdentified] = useState(true);
  const [soundOn, setSoundOn] = useState(false);
  const [sending, setSending] = useState(false);
  const [adminReadAt, setAdminReadAt] = useState<string | null>(null);
  const [theyTyping, setTheyTyping] = useState(false);
  const [ctx, setCtx] = useState<{ id: string; rect: DOMRect } | null>(null);
  const [ctxClosing, setCtxClosing] = useState(false);
  const [reply, setReply] = useState<{ id: string; body: string; sender: "VISITOR" | "ADMIN" } | null>(null);
  const [lightbox, setLightbox] = useState<{ images: Attachment[]; index: number } | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  // Promo nudge bubble above the launcher. Shows on every visit until the
  // visitor dismisses it (X) or opens the chat — both persist in localStorage.
  const [badgeShown, setBadgeShown] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // Sticky header that slides in from the top while the keyboard is up (the real
  // header scrolls off, like Telegram).
  const [stickyShow, setStickyShow] = useState(false);
  // Keyboard up? When it is, the browser's bottom chrome is gone (the keyboard
  // replaces it), so the big bottom inset must collapse to a small one.
  const [kbUp, setKbUp] = useState(false);
  // Bottom inset for the composer depends on the browser's bottom chrome, which
  // overlaps the content differently: Chrome iOS has a tall bottom nav bar,
  // Safari a shorter URL bar, everything else (Firefox, Android) reports the
  // visible height correctly and needs almost nothing.
  const [bottomPad, setBottomPad] = useState("pb-3");
  // Bottom inset while the keyboard is UP (browser chrome is gone, but Safari
  // still tucks a small URL pill above the keyboard, so it needs a bit more).
  const [kbUpPad, setKbUpPad] = useState("pb-3");
  // Firefox renders the chat fine without the sticky header — skip it there.
  const [isFirefox, setIsFirefox] = useState(false);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  // No visualViewport keyboard handling on mobile — the app-shell lock below
  // (Telegram-Web recipe) + native Safari is what makes it smooth.
  const lastTypingSent = useRef(0);
  const typingHide = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Used ONLY inside event handlers (never inside a setState updater) to dedup
  // notifications — safe from Strict Mode's updater double-invoke.
  const notified = useRef<Set<string>>(new Set());
  const openRef = useRef(open);
  openRef.current = open;
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const readyRef = useRef(false);
  const initPromise = useRef<Promise<void> | null>(null);
  const beep = useBeep();

  useTitleAlert(unread > 0, "💬 Новое сообщение");

  // PURE updater: dedup is derived from `prev` only — no external ref mutation,
  // so React Strict Mode's double-invoke in dev can't drop messages.
  const addMessages = useCallback((incoming: Msg[]) => {
    setMessages((prev) => {
      const next = [...prev];
      for (const m of incoming) {
        if (!m || !m.id) continue;
        if (next.some((x) => x.id === m.id)) continue; // already have the real one
        // Reconcile with our optimistic copy (same content) — replace it IN
        // PLACE keeping its clientKey so the bubble doesn't remount/re-animate.
        const optIdx = next.findIndex(
          (x) => x.pending && x.sender === m.sender && x.body === m.body
        );
        if (optIdx !== -1) {
          next[optIdx] = { ...m, clientKey: next[optIdx]!.clientKey ?? next[optIdx]!.id };
        } else {
          next.push({ ...m, clientKey: m.clientKey ?? m.id });
        }
      }
      next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return next;
    });
  }, []);

  // Deterministically establish the visitor identity (and load history) exactly
  // once. Returns the shared in-flight promise so senders truly await it — this
  // is what prevents the "send before cookie exists" race.
  const ensureVisitor = useCallback((): Promise<void> => {
    if (initPromise.current) return initPromise.current;
    initPromise.current = fetch("/api/chat/init", { method: "POST" })
      .then((r) => r.json())
      .then((data: { messages?: Msg[]; unread?: number; adminReadAt?: string | null }) => {
        addMessages(data.messages || []);
        setUnread(data.unread || 0);
        if (data.adminReadAt !== undefined) setAdminReadAt(data.adminReadAt);
        readyRef.current = true;
        setReady(true);
      })
      .catch(() => {
        initPromise.current = null; // allow retry
      });
    return initPromise.current;
  }, [addMessages]);

  // Mount: restore prefs + open state, then establish identity + stream.
  useEffect(() => {
    setSoundOn(localStorage.getItem("pf_chat_sound") === "1");
    setIdentified(localStorage.getItem("pf_chat_identified") === "1");
    if (localStorage.getItem("pf_chat_open") === "1") setOpen(true);
    ensureVisitor();
  }, [ensureVisitor]);

  // Realtime stream — connects once the visitor identity is guaranteed.
  useEffect(() => {
    if (!ready) return;
    const es = new EventSource("/api/chat/stream");
    // On (re)connect, backfill history so nothing is lost during a drop.
    es.onopen = () => {
      fetch("/api/chat/history")
        .then((r) => r.json())
        .then((data: { messages?: Msg[] }) => addMessages(data.messages || []))
        .catch(() => {});
    };
    es.onmessage = (e) => {
      let evt: {
        kind: string;
        message?: Msg;
        by?: string;
        who?: string;
        readAt?: string;
        messageId?: string;
        reactions?: Reaction[];
      };
      try {
        evt = JSON.parse(e.data);
      } catch {
        return;
      }
      if (evt.kind === "reaction" && evt.messageId) {
        const id = evt.messageId;
        const reactions = evt.reactions ?? [];
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, reactions } : m)));
        return;
      }
      if (evt.kind === "delete" && evt.messageId) {
        const id = evt.messageId;
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deleting: true } : m)));
        setTimeout(() => setMessages((prev) => prev.filter((m) => m.id !== id)), 600);
        return;
      }
      if (evt.kind === "message" && evt.message) {
        const m = evt.message;
        const isNew = !notified.current.has(m.id);
        notified.current.add(m.id);
        addMessages([m]);
        if (m.sender === "ADMIN") {
          setTheyTyping(false);
          if (isNew && !openRef.current) {
            setUnread((u) => u + 1);
            if (soundRef.current) beep();
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification("Новое сообщение", { body: m.body.slice(0, 120) });
            }
          } else if (openRef.current) {
            // Panel is open => the visitor sees it now; mark read so the admin
            // gets the "прочитано" receipt.
            fetch("/api/chat/read", { method: "POST" }).catch(() => {});
          }
        }
      } else if (evt.kind === "read") {
        // Admin read our messages -> show "read"; our own read syncs across tabs.
        if (evt.by === "ADMIN" && evt.readAt) setAdminReadAt(evt.readAt);
        if (evt.by === "VISITOR") setUnread(0);
      } else if (evt.kind === "typing" && evt.who === "ADMIN") {
        setTheyTyping(true);
        if (typingHide.current) clearTimeout(typingHide.current);
        typingHide.current = setTimeout(() => setTheyTyping(false), 3500);
      }
    };
    return () => es.close();
  }, [ready, addMessages, beep]);

  // Persist open state.
  useEffect(() => {
    localStorage.setItem("pf_chat_open", open ? "1" : "0");
  }, [open]);

  // Track mobile breakpoint (drives the app-shell rendering).
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 639);
    check();
    const ua = navigator.userAgent;
    const crios = /crios/i.test(ua);
    const firefox = /fxios|firefox/i.test(ua);
    const safari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
    setBottomPad(crios ? "pb-32" : safari ? "pb-12" : "pb-3");
    // Keyboard-up inset: Safari needs a chunk (URL pill), Chrome iOS a moderate
    // lift to clear the keyboard, everyone else almost nothing.
    setKbUpPad(safari ? "pb-12" : crios ? "pb-[7.5rem]" : "pb-3");
    setIsFirefox(firefox);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Mobile app-shell lock: while the chat is open, hide the page and stop the
  // document from scrolling. The chat then renders as a normal-flow element
  // filling the viewport (no position:fixed around the input, no scrollable
  // background) — which is the only thing that fully kills the iOS Safari-tab
  // keyboard jump. Restores page + scroll position on close.
  useEffect(() => {
    if (!panelRender || !isMobile) return;
    const scrollY = window.scrollY;
    const page = document.getElementById("pf-page");
    const html = document.documentElement;
    const body = document.body;
    const isIOS =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const save = (el: HTMLElement) => ({
      position: el.style.position,
      top: el.style.top,
      left: el.style.left,
      right: el.style.right,
      width: el.style.width,
      height: el.style.height,
      overflow: el.style.overflow,
      margin: el.style.margin,
    });
    const prevHtml = save(html);
    const prevBody = save(body);
    const prevPageDisplay = page?.style.display ?? "";

    // THE fix: size the document to window.visualViewport.height — the ONLY
    // value that always equals the truly visible area (excludes BOTH the Safari
    // bottom toolbar AND the keyboard). CSS svh/dvh misbehave under the
    // position:fixed lock, which is why the composer kept hiding. We update only
    // the HEIGHT (never position) on viewport events, batched in one rAF — that
    // keeps it smooth while guaranteeing the composer sits in the visible area.
    const vv = window.visualViewport;
    let prevH = vv ? vv.height : window.innerHeight;
    let prevOffTop = vv ? vv.offsetTop : 0;
    // The content right above the input must stay above the input through EVERY
    // keyboard open/close — like Telegram. We hold the distance from the bottom
    // (scrollHeight - scrollTop - clientHeight) constant during a transition: the
    // content at the list's bottom edge is then always the same line, so it never
    // drifts toward the top. `distFromBottom` is captured on focusin/focusout (the
    // reliable open/close triggers) and kept fresh on every manual scroll, so it
    // always reflects WHERE THE USER IS — not one frozen line. At the very
    // top/bottom scrollTop just clamps, so the position can't shift there.
    let distFromBottom = 0;
    let steering = false; // true while we're driving scrollTop (a transition)
    const captureDist = () => {
      const el = scrollRef.current;
      if (el) distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    };
    const onListScroll = () => {
      if (!steering) captureDist(); // user scrolled while idle -> remember the spot
    };
    let raf = 0;
    const setH = () => {
      const el = scrollRef.current;
      const newH = vv ? vv.height : window.innerHeight;
      const h = `${newH}px`;
      const offTop = vv ? vv.offsetTop : 0;
      // "stable" = nothing is animating this frame. We only steer scroll while the
      // viewport is actually changing; once stable the user can scroll freely.
      const stable = Math.abs(newH - prevH) < 1 && Math.abs(offTop - prevOffTop) < 1;
      const prevScroll = el?.scrollTop ?? 0;
      steering = !stable;
      prevH = newH;
      prevOffTop = offTop;

      html.style.height = h;
      body.style.height = h;
      // Pin the sticky header to the top of the visible viewport.
      if (stickyHeaderRef.current) {
        stickyHeaderRef.current.style.top = `${offTop}px`;
      }
      // SHRINK the message list from the TOP by offsetTop. On Safari/Chrome/PWA
      // (not Firefox) the keyboard pushes the visible viewport DOWN (offsetTop > 0)
      // while our locked panel stays pinned to layout-top — so the list's top band
      // sits ABOVE the visible area and its first messages are unreachable (you
      // scroll to scrollTop:0 but the top is off-screen). The list is flex-1, so a
      // top margin both drops it into view AND shrinks its height (the composer at
      // the bottom is untouched) — exactly "narrow the dialog window from the top".
      if (el) {
        el.style.marginTop = offTop ? `${offTop}px` : "";
        if (!stable) {
          // Keep the line above the input fixed: same distance from the bottom.
          el.scrollTop = el.scrollHeight - el.clientHeight - distFromBottom;
        } else {
          el.scrollTop = prevScroll; // settled: leave it alone (free scrolling)
        }
      }
    };
    const onVV = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setH();
      });
    };
    if (page) page.style.display = "none";
    if (isIOS) html.style.position = "fixed";
    html.style.top = "0";
    html.style.left = "0";
    html.style.right = "0";
    html.style.width = "100%";
    body.style.width = "100%";
    html.style.margin = "0";
    body.style.margin = "0";
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    // Stop iOS from rubber-band-dragging the whole page (header + input would
    // move with it). Block touchmove everywhere EXCEPT inside the message list,
    // which stays the only thing that scrolls — with its own contained springy
    // bounce (.chat-scroll: overscroll-behavior: contain). The lightbox handles
    // its own gestures, so let it through too.
    const onTouchMove = (e: TouchEvent) => {
      const t = e.target as Element | null;
      if (t && t.closest(".chat-scroll, [data-chat-lightbox]")) return;
      if (e.cancelable) e.preventDefault();
    };
    setH();
    captureDist();
    vv?.addEventListener("resize", onVV);
    vv?.addEventListener("scroll", onVV);
    window.addEventListener("resize", onVV);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    // focusin/focusout = the reliable keyboard open/close triggers: snapshot the
    // line above the input right before the viewport starts moving. The scroll
    // listener keeps that snapshot current while the user reads.
    document.addEventListener("focusin", captureDist);
    document.addEventListener("focusout", captureDist);
    scrollRef.current?.addEventListener("scroll", onListScroll, { passive: true });
    const listEl = scrollRef.current;
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", onVV);
      vv?.removeEventListener("scroll", onVV);
      window.removeEventListener("resize", onVV);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("focusin", captureDist);
      document.removeEventListener("focusout", captureDist);
      listEl?.removeEventListener("scroll", onListScroll);
      const restore = (el: HTMLElement, p: ReturnType<typeof save>) => {
        el.style.position = p.position;
        el.style.top = p.top;
        el.style.left = p.left;
        el.style.right = p.right;
        el.style.width = p.width;
        el.style.height = p.height;
        el.style.overflow = p.overflow;
        el.style.margin = p.margin;
        el.style.overscrollBehavior = "";
      };
      if (page) page.style.display = prevPageDisplay;
      if (scrollRef.current) scrollRef.current.style.marginTop = "";
      restore(html, prevHtml);
      restore(body, prevBody);
      window.scrollTo(0, scrollY);
    };
  }, [panelRender, isMobile]);

  // Sticky header: when the composer is focused (keyboard up) the real header
  // scrolls off, so after a short beat we slide in a compact sticky header from
  // the top. On blur it slides back out.
  useEffect(() => {
    if (!panelRender || !isMobile) {
      setStickyShow(false);
      setKbUp(false);
      return;
    }
    const panel = panelRef.current;
    if (!panel) return;
    let t: ReturnType<typeof setTimeout>;
    const onFocusIn = () => {
      setKbUp(true);
      clearTimeout(t);
      t = setTimeout(() => setStickyShow(true), 320);
    };
    const onFocusOut = () => {
      setKbUp(false);
      clearTimeout(t);
      setStickyShow(false);
    };
    panel.addEventListener("focusin", onFocusIn);
    panel.addEventListener("focusout", onFocusOut);
    return () => {
      clearTimeout(t);
      panel.removeEventListener("focusin", onFocusIn);
      panel.removeEventListener("focusout", onFocusOut);
    };
  }, [panelRender, isMobile]);

  // Show the promo badge shortly after load, unless it was dismissed before.
  useEffect(() => {
    if (localStorage.getItem("pf_chat_badge_dismissed") === "1") return;
    const t = setTimeout(() => setBadgeShown(true), 900);
    return () => clearTimeout(t);
  }, []);

  // Opening the chat retires the badge for good (visitor found the chat —
  // no need to nudge them again on future visits).
  useEffect(() => {
    if (!open) return;
    setBadgeShown(false);
    localStorage.setItem("pf_chat_badge_dismissed", "1");
  }, [open]);

  const dismissBadge = useCallback(() => {
    setBadgeShown(false);
    localStorage.setItem("pf_chat_badge_dismissed", "1");
  }, []);

  // Genie open/close: mount, then animate in; on close animate out, then unmount.
  useEffect(() => {
    if (open) {
      setPanelRender(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setPanelShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setPanelShown(false);
    const t = setTimeout(() => setPanelRender(false), 280);
    return () => clearTimeout(t);
  }, [open]);

  // Reliable scroll-to-bottom: wait two frames so new message / composer /
  // keyboard layout has settled before measuring scrollHeight.
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      })
    );
  }, []);

  // Floating "scroll to latest" button: show it once scrolled away from bottom.
  const onMessagesScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 400);
  }, []);

  // Scroll to bottom only on real content changes / open — NOT on keyboard
  // (the keyboard case is handled by usePinToKeyboard's bottom-anchoring).
  useEffect(() => {
    if (panelRender) scrollToBottom();
  }, [messages, panelRender, panelShown, theyTyping, scrollToBottom]);

  // When the reply bar or the staged-files strip appears (both grow the
  // composer) re-scroll so the last message stays visible.
  useEffect(() => {
    if (panelRender && (reply || staged.length > 0)) scrollToBottom();
  }, [reply, staged.length, panelRender, scrollToBottom]);

  // Tell the admin we're typing (throttled to ~1 / 2s). Ensures identity first.
  function onInputChange(value: string) {
    setInput(value);
    const now = Date.now();
    if (now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now;
      ensureVisitor().then(() => {
        fetch("/api/chat/typing", { method: "POST" }).catch(() => {});
      });
    }
  }

  // Toggle a reaction on a message (optimistic; server + SSE reconcile).
  function react(messageId: string, emoji: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, reactions: applyReactionToggle(m.reactions ?? [], "VISITOR", emoji) }
          : m
      )
    );
    fetch("/api/chat/react", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, emoji }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.reactions) {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, reactions: d.reactions } : m))
          );
        }
      })
      .catch(() => {});
  }

  // Tap a reply snippet -> scroll to the quoted message and pulse it. On mobile
  // with the keyboard up: drop it first, wait for the panel to settle (900ms).
  function jumpToMessage(id: string) {
    const run = () => {
      const el = scrollRef.current?.querySelector<HTMLElement>(`[data-msg-id="${id}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Start the pulse AFTER the smooth scroll lands, then hold it a while.
      window.setTimeout(() => {
        setHighlightId(id);
        window.setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 2000);
      }, 420);
    };
    const active = document.activeElement as HTMLElement | null;
    const kbUp = active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT");
    if (kbUp && window.innerWidth <= 639) {
      active.blur();
      window.setTimeout(run, 900);
    } else {
      run();
    }
  }

  function startReply(id: string) {
    // Focus synchronously (within the user gesture) so the keyboard opens on
    // mobile — like in social apps.
    composerRef.current?.focus();
    setMessages((prev) => {
      const target = prev.find((m) => m.id === id);
      // Visitors only reply to admin messages.
      if (target && target.sender === "ADMIN") {
        setReply({ id, body: target.body, sender: target.sender });
      }
      return prev;
    });
  }

  // Delete own message (dissolve locally; the other side dissolves via SSE).
  function deleteMessage(id: string) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deleting: true } : m)));
    setTimeout(() => setMessages((prev) => prev.filter((m) => m.id !== id)), 600);
    fetch("/api/chat/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: id }),
    }).catch(() => {});
  }

  useEffect(() => {
    if (open && unread > 0) {
      setUnread(0);
      fetch("/api/chat/read", { method: "POST" }).catch(() => {});
    }
  }, [open, unread]);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    localStorage.setItem("pf_chat_sound", next ? "1" : "0");
    if (next) {
      beep();
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    }
  }

  async function send() {
    const body = sanitizeChatBody(input);
    if (!body || sending) return;
    setSending(true);
    setInput("");
    const replyToMsg = reply;
    setReply(null);

    // Optimistic: show the message immediately.
    const tempId = `tmp_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
    addMessages([
      {
        id: tempId,
        sender: "VISITOR",
        body,
        createdAt: new Date().toISOString(),
        pending: true,
        replyTo: replyToMsg
          ? { id: replyToMsg.id, body: replyToMsg.body, sender: replyToMsg.sender }
          : null,
      },
    ]);

    // Guarantee the cookie/identity exists before sending (no race).
    await ensureVisitor();

    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          name: name.trim() || undefined,
          contact: contact.trim() || undefined,
          replyTo: replyToMsg?.id,
        }),
      });
      const data = await res.json();
      // Reconcile the optimistic message with the persisted one (keeps its
      // clientKey, so the bubble doesn't re-animate).
      if (data.message) addMessages([data.message]);
      if (!identified) {
        setIdentified(true);
        localStorage.setItem("pf_chat_identified", "1");
      }
    } catch {
      // Mark the optimistic message as failed and restore the input.
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false } : m)));
      setInput(body);
    } finally {
      setSending(false);
    }
  }

  // Persist a media/file message (used by the attachment sender).
  const commitAttachments = useCallback(
    async (body: string, attachments: Attachment[], replyToId?: string): Promise<ChatMsg | null> => {
      await ensureVisitor();
      try {
        const res = await fetch("/api/chat/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body,
            name: name.trim() || undefined,
            contact: contact.trim() || undefined,
            replyTo: replyToId,
            attachments,
          }),
        });
        const data = await res.json();
        if (!identified) {
          setIdentified(true);
          localStorage.setItem("pf_chat_identified", "1");
        }
        return (data.message as ChatMsg) ?? null;
      } catch {
        return null;
      }
    },
    [ensureVisitor, name, contact, identified]
  );

  const { sendFiles, cancelUpload } = useChatAttachmentSend({
    uploadUrl: "/api/chat/upload",
    mySide: "VISITOR",
    setMessages,
    commit: commitAttachments,
    onError: (msg) => {
      setMediaError(msg);
      window.setTimeout(() => setMediaError(null), 4000);
    },
  });

  // Stage selected files (preview strip) — they upload only when you press send.
  function stageFiles(files: File[]) {
    setStaged((prev) => {
      const next = [...prev];
      for (const f of files) {
        const err = validateFile(f);
        if (err) {
          setMediaError(err);
          window.setTimeout(() => setMediaError(null), 4000);
          continue;
        }
        next.push({
          id: `s_${Date.now()}_${Math.round(Math.random() * 1e6)}`,
          file: f,
          previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
        });
      }
      return next;
    });
  }

  function removeStaged(id: string) {
    setStaged((prev) => {
      const item = prev.find((s) => s.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  }

  function onSend() {
    if (staged.length > 0) {
      const files = staged.map((s) => s.file);
      staged.forEach((s) => s.previewUrl && URL.revokeObjectURL(s.previewUrl));
      const caption = sanitizeChatBody(input);
      const replyId = reply?.id;
      setStaged([]);
      setInput("");
      setReply(null);
      sendFiles(files, caption, replyId);
      return;
    }
    send();
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Открыть чат"
        className={cn(
          // Align with the site container's right edge (max-w-content = 72rem + px-5),
          // not the raw viewport edge, so it doesn't float off in the far corner on
          // wide screens. Clamps to 1.25rem on narrow screens.
          "fixed bottom-8 right-[max(1.25rem,calc(50vw_-_36rem_-_0.75rem))] z-[95] h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/30 transition hover:scale-105",
          // On mobile the fullscreen chat has its own close (X) in the header,
          // so hide this floating button while open. Keep it on desktop.
          open ? "hidden sm:flex" : "flex"
        )}
      >
        {open ? <X size={22} /> : <MessageCircle size={24} />}
        {!open && unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {/* Promo nudge above the launcher. Same right-edge clamp as the button so
          its tail lines up; dismiss (X) or opening the chat hides it for good. */}
      {badgeShown && !open ? (
        <div
          className="fixed bottom-[6.5rem] right-[max(1.25rem,calc(50vw_-_36rem_-_0.75rem))] z-[94] w-60 max-w-[calc(100vw-2.5rem)] animate-fade-in"
        >
          <div className="relative rounded-2xl border border-bg-border bg-bg-card p-3.5 pr-9 shadow-2xl shadow-black/40">
            <button
              onClick={dismissBadge}
              aria-label="Скрыть"
              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-fg-muted transition hover:bg-bg-soft hover:text-fg"
            >
              <X size={14} />
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="block text-left text-sm leading-snug"
            >
              <span className="font-semibold text-fg">Есть вопрос по проекту?</span>{" "}
              <span className="text-fg-muted">Напишите — отвечу лично и быстро.</span>
            </button>
            {/* tail pointing down to the launcher */}
            <div className="absolute -bottom-1.5 right-7 h-3 w-3 rotate-45 border-b border-r border-bg-border bg-bg-card" />
          </div>
        </div>
      ) : null}

      {/* Mobile backdrop: hides the page (and any scroll behind it) on phones,
          so clients never see the page move behind the fullscreen chat. */}
      {panelRender ? (
        <div
          aria-hidden
          className={cn(
            "fixed inset-0 z-[94] bg-bg-soft transition-opacity duration-200 sm:hidden",
            panelShown ? "opacity-100" : "opacity-0"
          )}
        />
      ) : null}

      {panelRender ? (
        <div
          ref={panelRef}
          className={cn(
            // Mobile: NORMAL-FLOW app-shell (page hidden behind it) filling the
            // locked document (height = window.innerHeight via the lock effect).
            // h-full (NOT 100dvh, which shrinks with the keyboard) keeps it stable
            // — Safari handles the keyboard natively, like Telegram Web.
            "relative z-[95] flex h-full w-full flex-col overflow-hidden bg-bg-soft",
            // Desktop: floating fixed panel bottom-right.
            "sm:fixed sm:inset-auto sm:bottom-24 sm:right-[max(1.25rem,calc(50vw_-_36rem_-_0.75rem))] sm:h-[min(34rem,75vh)] sm:w-[min(24rem,calc(100vw-2.5rem))] sm:rounded-2xl sm:border sm:border-bg-border sm:shadow-2xl",
            // Only the open/close genie animates. height/top are tracked per
            // frame imperatively and MUST be instant (no transition).
            // IMPORTANT: when OPEN the panel must have `transform: none` — on iOS
            // Safari a transform on a position:fixed element breaks fixing (it
            // scrolls with the page on focus -> "flies up"). So the shown state
            // has NO transform; only the hidden state uses translate/scale.
            "origin-bottom transition-[transform,opacity] duration-200 ease-out sm:origin-bottom-right",
            panelShown
              ? "opacity-100"
              : "pointer-events-none translate-y-4 opacity-0 sm:translate-y-0 sm:scale-90"
          )}
        >
          <div className="flex items-center justify-between border-b border-bg-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-fg">Чат</p>
              <p className="text-xs text-fg-faint">Обычно отвечаю быстро</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleSound}
                title={soundOn ? "Звук включён" : "Звук выключен"}
                className={cn("rounded p-1.5", soundOn ? "text-accent" : "text-fg-faint hover:text-fg")}
              >
                {soundOn ? <Bell size={18} /> : <BellOff size={18} />}
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Свернуть чат"
                className="rounded p-1.5 text-fg-faint hover:text-fg"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={scrollRef} onScroll={onMessagesScroll} className="chat-scroll flex-1 overflow-y-auto p-4">
            {/* min-h-full + justify-end pins messages to the bottom like a messenger */}
            <div className="flex min-h-[calc(100%+1px)] flex-col justify-end space-y-2">
            {messages.length === 0 ? (
              <p className="text-center text-sm text-fg-faint">
                Напишите сообщение — отвечу здесь же.
              </p>
            ) : (
              messages.map((m) => {
                const isRead =
                  m.sender === "VISITOR" && !m.pending && !!adminReadAt && m.createdAt <= adminReadAt;
                return (
                  <div
                    key={m.clientKey ?? m.id}
                    data-chat-msg
                    data-msg-id={m.id}
                    className={cn("animate-bubble", ctx?.id === m.id && !ctxClosing && "invisible")}
                  >
                    <ChatMessage
                      message={m}
                      mySide="VISITOR"
                      isRead={isRead}
                      onOpenContext={(id, rect) => {
                        setCtxClosing(false);
                        setCtx({ id, rect });
                      }}
                      onReact={react}
                      onReply={startReply}
                      onDismiss={() => composerRef.current?.blur()}
                      onCancelUpload={cancelUpload}
                      onOpenImage={(images, index) => setLightbox({ images, index })}
                      onJumpTo={jumpToMessage}
                      highlighted={highlightId === m.id}
                    />
                  </div>
                );
              })
            )}
            {theyTyping ? (
              <div className="flex animate-fade-in items-center gap-1 px-1 text-xs text-fg-faint">
                <span className="inline-flex gap-0.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-faint [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-faint [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-faint" />
                </span>
                печатает…
              </div>
            ) : null}
            </div>
          </div>
          {showScrollDown ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
              }
              aria-label="К последним сообщениям"
              className="absolute bottom-3 right-3 z-[5] flex h-9 w-9 animate-fade-in items-center justify-center rounded-full bg-bg-card/95 text-fg shadow-lg ring-1 ring-bg-border backdrop-blur transition hover:bg-bg-card"
            >
              <ChevronDown size={20} />
            </button>
          ) : null}
          </div>

          <div className={cn("border-t border-bg-border px-2.5 pt-2 sm:pb-3", kbUp ? kbUpPad : bottomPad)}>
            {mediaError ? (
              <p className="mb-2 rounded-md bg-red-500/15 px-2 py-1 text-xs text-red-300">{mediaError}</p>
            ) : null}
            {reply ? <ReplyBar body={reply.body} onCancel={() => setReply(null)} /> : null}
            <StagedStrip files={staged} onRemove={removeStaged} />
            {!identified ? (
              // Mobile: rounded fields matching the message input. Desktop:
              // underline-only (border-bottom) fields.
              <div className="mb-2 grid grid-cols-2 gap-2 sm:gap-5">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Имя"
                  className="rounded-xl border border-bg-border bg-bg px-3.5 py-2.5 text-sm text-fg outline-none transition placeholder:text-fg-faint focus:border-accent sm:rounded-none sm:border-0 sm:border-b sm:border-bg-border sm:bg-transparent sm:px-1 sm:py-1.5 sm:focus:border-accent"
                />
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Контакт"
                  className="rounded-xl border border-bg-border bg-bg px-3.5 py-2.5 text-sm text-fg outline-none transition placeholder:text-fg-faint focus:border-accent sm:rounded-none sm:border-0 sm:border-b sm:border-bg-border sm:bg-transparent sm:px-1 sm:py-1.5 sm:focus:border-accent"
                />
              </div>
            ) : null}
            {/* Mobile: lightly-rounded pill (text · attach). Desktop: flat bar
                with a full-width bottom border (emoji · text · attach). Buttons
                vertically centered; attach (plus) always on the right. */}
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center rounded-xl border border-bg-border bg-bg transition-colors sm:rounded-none sm:border-x-0 sm:border-t-0 sm:border-b sm:bg-transparent sm:focus-within:border-accent">
                <div className="hidden shrink-0 sm:block">
                  <EmojiHover align="left" onPick={(e) => setInput((prev) => prev + e)} />
                </div>
                <AutoTextarea
                  value={input}
                  onChange={onInputChange}
                  onSubmit={onSend}
                  inputRef={composerRef}
                  placeholder="Сообщение"
                  className="flex-1 resize-none bg-transparent py-2.5 pl-3.5 pr-1.5 text-sm text-fg outline-none placeholder:text-fg-faint sm:pl-1.5"
                />
                <div className="shrink-0">
                  <AttachButton align="right" onFiles={stageFiles} />
                </div>
              </div>
              {staged.length > 0 || sanitizeChatBody(input) ? (
                <button
                  onClick={onSend}
                  // Keep the keyboard open: don't let the button steal focus.
                  onMouseDown={(e) => e.preventDefault()}
                  disabled={sending}
                  aria-label="Отправить"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-sm transition active:scale-95 disabled:opacity-50"
                >
                  <Send size={18} />
                </button>
              ) : null}
            </div>
          </div>

          {/* Lightbox lives INSIDE the panel -> stays within the chat window. */}
          {lightbox ? (
            <ChatLightbox images={lightbox.images} index={lightbox.index} onClose={() => setLightbox(null)} />
          ) : null}
        </div>
      ) : null}

      {/* Sticky header (mobile, keyboard up). Outer element is fixed and pinned
          to the visible-viewport top (top set imperatively); the inner element
          does the slide/fade so we never put a transform on a fixed element. */}
      {panelRender && isMobile && !isFirefox ? (
        <div
          ref={stickyHeaderRef}
          className="pointer-events-none fixed left-0 right-0 z-[96] overflow-hidden"
          style={{ top: 0 }}
        >
          <div
            className={cn(
              "flex items-center justify-between border-b border-bg-border bg-bg-soft/95 px-4 py-3 backdrop-blur transition-all duration-300 ease-out",
              stickyShow ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0"
            )}
          >
            <div>
              <p className="text-sm font-semibold text-fg">Чат</p>
              <p className="text-xs text-fg-faint">Обычно отвечаю быстро</p>
            </div>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpen(false)}
              aria-label="Свернуть чат"
              className="rounded p-1.5 text-fg-faint hover:text-fg"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      ) : null}

      {/* Focus overlay — rendered OUTSIDE the transformed panel so fixed
          positioning is relative to the viewport. */}
      {ctx
        ? (() => {
            const msg = messages.find((m) => m.id === ctx.id);
            if (!msg) return null;
            return (
              <MessageOverlay
                message={msg}
                mySide="VISITOR"
                isRead={!!adminReadAt && !msg.pending && msg.createdAt <= adminReadAt}
                anchor={ctx.rect}
                container={panelRef.current}
                canReply={msg.sender === "ADMIN" && !msg.pending}
                canDelete={msg.sender === "VISITOR" && !msg.pending}
                onReact={react}
                onReply={startReply}
                onDelete={deleteMessage}
                onClosing={() => setCtxClosing(true)}
                onClose={() => {
                  setCtx(null);
                  setCtxClosing(false);
                }}
              />
            );
          })()
        : null}
    </>
  );
}
