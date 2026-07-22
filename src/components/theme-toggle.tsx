"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark" | "system";
type EffectiveTheme = "light" | "dark";

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

export function ThemeToggle() {
  const effective = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Keep the `dark` class on <html> in sync with the resolved theme — on
  // every mount (fixes the class not being re-applied after a reload) and
  // whenever the stored preference or system preference changes.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", effective === "dark");
  }, [effective]);

  const toggle = useCallback(() => {
    const next: Theme = effective === "dark" ? "light" : "dark";
    localStorage.setItem("theme", next);
    window.dispatchEvent(new Event("storage"));
  }, [effective]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      aria-label={effective === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
      onClick={toggle}
    >
      {effective === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  );
}
