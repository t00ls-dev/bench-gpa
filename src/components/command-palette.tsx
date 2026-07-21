"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import { useServerFn } from "@tanstack/react-start";
import { searchProducts } from "@/lib/product.functions";
import {
  LayoutDashboard,
  Package,
  Layers,
  Upload,
  Shield,
  BookText,
  Search,
  Loader2,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, keywords: "início home" },
  { to: "/produto", label: "Produto", icon: Package, keywords: "produto busca pesquisa" },
  { to: "/area", label: "Área", icon: Layers, keywords: "área regional" },
  { to: "/upload", label: "Importar", icon: Upload, keywords: "upload importar planilha" },
  { to: "/admin", label: "Administração", icon: Shield, keywords: "admin administração" },
  { to: "/admin/docs", label: "Documentação", icon: BookText, keywords: "docs documentação ajuda" },
] as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<{ prod_code: string; prod_name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const doSearch = useServerFn(searchProducts);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const cb = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((p) => !p);
      }
    };
    document.addEventListener("keydown", cb);
    return () => document.removeEventListener("keydown", cb);
  }, []);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setProducts([]);
    }
  }, [open]);

  useEffect(() => {
    if (search.length < 2) {
      setProducts([]);
      return;
    }
    setLoading(true);
    window.clearTimeout(debounceRef.current ?? undefined);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await doSearch({ data: { q: search } });
        setProducts(res.slice(0, 8));
      } catch {
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(debounceRef.current ?? undefined);
  }, [search, doSearch]);

  const run = useCallback(
    (to: string) => {
      setOpen(false);
      navigate({ to });
    },
    [navigate],
  );

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Paleta de comandos"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
    >
      <div
        className="fixed inset-0 bg-black/50"
        aria-hidden="true"
        onClick={() => setOpen(false)}
      />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-popover shadow-elevated">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Command.Input
            ref={inputRef}
            value={search}
            onValueChange={setSearch}
            placeholder="Buscar páginas ou produtos…"
            className="flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <Command.List className="max-h-72 overflow-y-auto p-2">
          <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
            {loading ? "Buscando…" : "Nenhum resultado encontrado"}
          </Command.Empty>

          {search.length < 2 && (
            <Command.Group heading="Navegação">
              {NAV_ITEMS.map((item) => (
                <Command.Item
                  key={item.to}
                  value={`nav:${item.to} ${item.label} ${item.keywords}`}
                  onSelect={() => run(item.to)}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
                >
                  <item.icon className="size-4 text-muted-foreground" />
                  <span>{item.label}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {loading && products.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Buscando produtos…
            </div>
          )}

          {products.length > 0 && (
            <Command.Group heading="Produtos">
              {products.map((p) => (
                <Command.Item
                  key={p.prod_code}
                  value={`prod:${p.prod_code} ${p.prod_name} ${p.prod_code}`}
                  onSelect={() => run(`/produto?prodCode=${encodeURIComponent(p.prod_code)}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
                >
                  <Package className="size-4 text-muted-foreground" />
                  <span className="font-mono text-xs text-muted-foreground">{p.prod_code}</span>
                  <span className="truncate">{p.prod_name}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
