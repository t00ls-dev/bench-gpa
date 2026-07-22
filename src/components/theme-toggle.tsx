"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Theme = "light" | "dark" | "system";

function getStored(): Theme {
  if (typeof window === "undefined") return "system";
  const v = localStorage.getItem("theme");
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
  } else {
    root.classList.toggle("dark", window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
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

function getSnapshot(): Theme {
  return getStored();
}

function getServerSnapshot(): Theme {
  return "system";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem("theme", t);
    applyTheme(t);
    window.dispatchEvent(new Event("storage"));
  }, []);

  const icon = theme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Tema">
          {icon}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="right">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 size-4" /> Claro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 size-4" /> Escuro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Sun className="mr-2 size-4" />
          <Moon className="mr-2 size-4 -ml-1" /> Sistema
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
