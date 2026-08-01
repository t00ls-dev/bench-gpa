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
 * Resolve o tema efetivo (light/dark) a partir da preferência salva e da
 * configuração do sistema, mantendo a classe `dark` no <html> sincronizada.
 * Use em qualquer página que precise honrar o tema, inclusive as que não têm
 * o toggle (login), para que a preferência seja respeitada.
 */
export function useEffectiveTheme(): EffectiveTheme {
  const effective = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", effective === "dark");
  }, [effective]);

  return effective;
}

/** Grava a preferência de tema e notifica os assinantes na mesma aba. */
export function setStoredTheme(theme: EffectiveTheme) {
  localStorage.setItem("theme", theme);
  window.dispatchEvent(new Event("storage"));
}
