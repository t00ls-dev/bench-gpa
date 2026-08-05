"use client";

import { useEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

function getStored(): Theme {
  if (typeof window === "undefined") return "system";
  const v = localStorage.getItem("theme");
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveTheme(theme: Theme): EffectiveTheme {
  return theme === "system" ? (prefersDark() ? "dark" : "light") : theme;
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => {
    window.removeEventListener("storage", cb);
    mq.removeEventListener("change", cb);
  };
}

function getSnapshot(): EffectiveTheme {
  return resolveTheme(getStored());
}

function getServerSnapshot(): EffectiveTheme {
  return "light";
}

/**
 * Resolves the effective theme (light/dark) from the saved preference and
 * the system setting, keeping the `dark` class on <html> in sync. Use on
 * any page that needs to honor the theme, including ones without the
 * toggle (login), so the preference is still respected.
 */
export function useEffectiveTheme(): EffectiveTheme {
  const effective = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", effective === "dark");
  }, [effective]);

  return effective;
}

/** Saves the theme preference and notifies subscribers in the same tab. */
export function setStoredTheme(theme: EffectiveTheme) {
  localStorage.setItem("theme", theme);
  window.dispatchEvent(new Event("storage"));
}
