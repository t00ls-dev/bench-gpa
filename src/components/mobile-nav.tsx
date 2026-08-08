"use client";

import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  Layers,
  HelpCircle,
  Upload,
  Shield,
  BookText,
  LogOut,
  Menu,
  Loader2,
  ClipboardList,
} from "lucide-react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { useNavPendingPath, isNavPendingTo } from "@/hooks/use-nav-pending";

const TABS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/product", label: "Produto", icon: Package },
  { to: "/area", label: "Área", icon: Layers },
  { to: "/forecast", label: "Previsão", icon: ClipboardList },
] as const;

const ADMIN_ITEMS = [
  { to: "/upload", label: "Importar", icon: Upload },
  { to: "/admin/docs", label: "Documentação", icon: BookText },
  { to: "/admin", label: "Administração", icon: Shield },
] as const;

interface Props {
  isAdmin: boolean;
  name: string;
  employeeId: string | null;
  onSignOut: () => void;
}

export function MobileNav({ isAdmin, name, employeeId, onSignOut }: Props) {
  const loc = useLocation();
  const pendingPath = useNavPendingPath();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isActive = (to: string) => {
    if (to === "/") return loc.pathname === "/";
    if (to === "/admin") return loc.pathname === "/admin";
    return loc.pathname === to || loc.pathname.startsWith(to + "/");
  };

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur-lg md:hidden">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-around px-2">
          {TABS.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              preload="intent"
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-medium transition-colors ${
                isActive(tab.to) ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isNavPendingTo(pendingPath, tab.to) ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <tab.icon className="size-5" />
              )}
              <span>{tab.label}</span>
            </Link>
          ))}
          <button
            onClick={() => setDrawerOpen(true)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-medium transition-colors ${
              drawerOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Menu className="size-5" />
            <span>Mais</span>
          </button>
        </div>
      </nav>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <div className="flex flex-col items-center pt-6 pb-2">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
              {name[0].toUpperCase()}
            </div>
            <span className="mt-2 text-sm font-medium truncate max-w-[80%]">{name}</span>
            {employeeId && (
              <span className="text-xs text-muted-foreground truncate max-w-[80%]">
                {employeeId}
              </span>
            )}
          </div>
          <div className="space-y-1 px-2 pb-4">
            {isAdmin && (
              <>
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="h-px flex-1 bg-border" />
                </div>
                {ADMIN_ITEMS.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    preload="intent"
                    onClick={() => setDrawerOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive(item.to)
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    {isNavPendingTo(pendingPath, item.to, item.to === "/admin") ? (
                      <Loader2 className="size-5 shrink-0 animate-spin" />
                    ) : (
                      <item.icon className="size-5 shrink-0" />
                    )}
                    {item.label}
                  </Link>
                ))}
              </>
            )}
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="h-px flex-1 bg-border" />
            </div>
            <Link
              to="/howto"
              preload="intent"
              onClick={() => setDrawerOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
            >
              <HelpCircle className="size-5 shrink-0" />
              Como usar
            </Link>
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="h-px flex-1 bg-border" />
            </div>
            <button
              onClick={() => {
                setDrawerOpen(false);
                onSignOut();
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              <LogOut className="size-5 shrink-0" />
              Sair
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
