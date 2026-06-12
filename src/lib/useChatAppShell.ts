"use client";

import { useEffect, useState, type RefObject } from "react";

// Shared mobile chat keyboard handling (extracted from the guest ChatWidget,
// see CLAUDE.md §6.5e). While the conversation is open on mobile it:
//  - locks the document to window.visualViewport.height (the only value that
//    always equals the truly visible area) and html position:fixed on iOS, so
//    the composer never hides under browser chrome / the keyboard;
//  - sizes the pane to the same height;
//  - blocks touchmove outside the message list (only the list scrolls, with a
//    contained springy bounce);
//  - positions a sticky header at the visible-viewport top;
//  - tracks the keyboard (kbUp) and exposes per-browser bottom-inset classes
//    (their bottom chrome overlaps the content differently — heuristics tuned
//    on device).
export function useChatAppShell(
  active: boolean,
  paneRef: RefObject<HTMLElement | null>,
  stickyHeaderRef: RefObject<HTMLElement | null>,
  maxWidth = 639,
  pageHideId?: string
) {
  const [isMobile, setIsMobile] = useState(false);
  const [bottomPad, setBottomPad] = useState("pb-3");
  const [kbUpPad, setKbUpPad] = useState("pb-3");
  const [isFirefox, setIsFirefox] = useState(false);
  const [kbUp, setKbUp] = useState(false);
  const [stickyShow, setStickyShow] = useState(false);

  // Mobile breakpoint + per-browser inset classes.
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= maxWidth);
    check();
    const ua = navigator.userAgent;
    const crios = /crios/i.test(ua);
    const firefox = /fxios|firefox/i.test(ua);
    const safari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
    const standalone =
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(display-mode: standalone)").matches) ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    setBottomPad(crios ? "pb-[120px]" : safari ? "pb-[46px]" : "pb-3");
    // Installed PWA has no browser chrome above the keyboard -> much smaller inset.
    setKbUpPad(standalone ? "pb-[20px]" : safari ? "pb-[62px]" : crios ? "pb-[118px]" : "pb-3");
    setIsFirefox(firefox);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [maxWidth]);

  // Document lock + viewport-height tracking.
  useEffect(() => {
    if (!active || !isMobile) return;
    const scrollY = window.scrollY;
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
    // Hide the background so there's nothing for iOS to scroll on focus —
    // keeps visualViewport.offsetTop at 0 (no jitter). The pane must be portaled
    // OUT of this element by the caller, or it'd be hidden too.
    const page = pageHideId ? document.getElementById(pageHideId) : null;
    const prevPageDisplay = page?.style.display ?? "";

    const vv = window.visualViewport;
    const list = paneRef.current?.querySelector(".chat-scroll") as HTMLElement | null;
    let prevH = vv ? vv.height : window.innerHeight;
    let prevOffTop = vv ? vv.offsetTop : 0;
    // Keep the line above the input fixed through every open/close by holding the
    // distance from the bottom constant during a transition. `distFromBottom` is
    // captured on focusin/focusout and refreshed on manual scroll so it always
    // tracks where the user is. See the guest for the full rationale.
    let distFromBottom = 0;
    let steering = false;
    const captureDist = () => {
      if (list) distFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    };
    const onListScroll = () => {
      if (!steering) captureDist();
    };
    let raf = 0;
    const setH = () => {
      const newH = vv ? vv.height : window.innerHeight;
      const h = `${newH}px`;
      const offTopPx = vv ? vv.offsetTop : 0;
      const offTop = `${offTopPx}px`;
      // "stable" = nothing animating this frame; only steer scroll while changing.
      const stable = Math.abs(newH - prevH) < 1 && Math.abs(offTopPx - prevOffTop) < 1;
      const prevScroll = list?.scrollTop ?? 0;
      steering = !stable;
      prevH = newH;
      prevOffTop = offTopPx;

      // Exactly like the guest: size ONLY html/body to the visible viewport; the
      // pane is h-full (inherits) and we never touch its top/height. Anything
      // extra (pane top/height tracking) made Safari fly the composer.
      html.style.height = h;
      body.style.height = h;
      if (stickyHeaderRef.current) {
        stickyHeaderRef.current.style.top = offTop;
      }
      // SHRINK the message list from the TOP by offsetTop. On Safari/Chrome/PWA
      // (not Firefox) the keyboard pushes the visible viewport DOWN while the
      // locked pane stays pinned to layout-top, so the list's top band is off
      // screen and the first messages are unreachable. The list is flex-1, so a
      // top margin drops it into view AND shrinks its height (composer untouched).
      if (list) {
        list.style.marginTop = offTopPx ? `${offTopPx}px` : "";
        if (!stable) {
          // Keep the line above the input fixed: same distance from the bottom.
          list.scrollTop = list.scrollHeight - list.clientHeight - distFromBottom;
        } else {
          list.scrollTop = prevScroll; // settled: leave it alone (free scrolling)
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
    document.addEventListener("focusin", captureDist);
    document.addEventListener("focusout", captureDist);
    list?.addEventListener("scroll", onListScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", onVV);
      vv?.removeEventListener("scroll", onVV);
      window.removeEventListener("resize", onVV);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("focusin", captureDist);
      document.removeEventListener("focusout", captureDist);
      list?.removeEventListener("scroll", onListScroll);
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
      if (list) list.style.marginTop = "";
      restore(html, prevHtml);
      restore(body, prevBody);
      if (page) page.style.display = prevPageDisplay;
      window.scrollTo(0, scrollY);
    };
  }, [active, isMobile, paneRef, stickyHeaderRef, pageHideId]);

  // Keyboard up? (focus tracking) + delayed sticky-header reveal.
  useEffect(() => {
    if (!active || !isMobile) {
      setKbUp(false);
      setStickyShow(false);
      return;
    }
    const pane = paneRef.current;
    if (!pane) return;
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
    pane.addEventListener("focusin", onFocusIn);
    pane.addEventListener("focusout", onFocusOut);
    return () => {
      clearTimeout(t);
      pane.removeEventListener("focusin", onFocusIn);
      pane.removeEventListener("focusout", onFocusOut);
    };
  }, [active, isMobile, paneRef]);

  return { isMobile, bottomPad, kbUpPad, kbUp, stickyShow, isFirefox };
}
