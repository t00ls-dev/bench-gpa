"use client";

import { useCallback } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setStoredTheme, useEffectiveTheme } from "@/hooks/use-theme";

export function ThemeToggle() {
  const effective = useEffectiveTheme();

  const toggle = useCallback(() => {
    setStoredTheme(effective === "dark" ? "light" : "dark");
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
