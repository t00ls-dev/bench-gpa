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
  const gTimer = useRef<ReturnType<typeof setTimeout>>();

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
        clearTimeout(gTimer.current);
        e.preventDefault();
        handler();
        return;
      }
      if (key === "g") {
        pendingG.current = true;
        clearTimeout(gTimer.current);
        gTimer.current = setTimeout(() => {
          pendingG.current = false;
        }, 500);
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", cb);
    return () => {
      document.removeEventListener("keydown", cb);
      clearTimeout(gTimer.current);
    };
  }, [letter, handler, enabled]);
}

export { useHotkey as default };
