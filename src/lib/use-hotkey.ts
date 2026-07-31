"use client";

import { useEffect, useRef } from "react";

export function useHotkey(key: string, handler: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const cb = (e: KeyboardEvent) => {
      if (e.key !== key) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      e.preventDefault();
      handler();
    };
    document.addEventListener("keydown", cb);
    return () => document.removeEventListener("keydown", cb);
  }, [key, handler, enabled]);
}

export function useGotoHotkey(letter: string, handler: () => void, enabled = true) {
  const pendingG = useRef(false);
  const gTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const cb = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (pendingG.current && key === letter) {
        pendingG.current = false;
        window.clearTimeout(gTimer.current ?? undefined);
        e.preventDefault();
        handler();
        return;
      }
      if (key === "g") {
        pendingG.current = true;
        window.clearTimeout(gTimer.current ?? undefined);
        gTimer.current = window.setTimeout(() => {
          pendingG.current = false;
        }, 500);
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", cb);
    return () => {
      document.removeEventListener("keydown", cb);
      window.clearTimeout(gTimer.current ?? undefined);
    };
  }, [letter, handler, enabled]);
}
