"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { Keyboard } from "lucide-react";

const SHORTCUTS = [
  { keys: "g + d", label: "Ir para Dashboard" },
  { keys: "g + p", label: "Ir para Produto" },
  { keys: "g + a", label: "Ir para Área" },
  { keys: "g + u", label: "Ir para Importar" },
  { keys: "g + o", label: "Ir para Documentação" },
  { keys: "g + n", label: "Ir para Administração" },
  { keys: "Cmd/Ctrl + K", label: "Abrir paleta de comandos" },
  { keys: "g + h", label: "Ir para Como usar" },
  { keys: "Shift + ?", label: "Abrir ajuda de atalhos" },
];

export function HelpOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Command.Dialog open={open} onOpenChange={onClose} label="Atalhos de teclado">
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        aria-hidden="true"
        onClick={onClose}
      >
        <div
          className="relative z-10 w-full max-w-md rounded-xl border border-border bg-popover p-6 shadow-elevated"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center gap-2">
            <Keyboard className="size-5 text-primary" />
            <h2 className="font-display text-lg font-semibold">Atalhos de teclado</h2>
          </div>
          <div className="space-y-3">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{s.label}</span>
                <kbd className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs">
                  {s.keys}
                </kbd>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Os atalhos não funcionam dentro de campos de texto.
          </p>
        </div>
      </div>
    </Command.Dialog>
  );
}
