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
  Ellipsis,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

const TABS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/produto", label: "Produto", icon: Package },
  { to: "/area", label: "Área", icon: Layers },
] as const;

const ADMIN_ITEMS = [
  { to: "/upload", label: "Importar", icon: Upload },
  { to: "/admin/docs", label: "Documentação", icon: BookText },
  { to: "/admin", label: "Administração", icon: Shield },
] as const;

interface Props {
  isAdmin: boolean;
  userEmail: string;
  onSignOut: () => void;
}

export function MobileNav({ isAdmin, userEmail, onSignOut }: Props) {
  const loc = useLocation();
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
                isActive(tab.to)
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="size-5" />
              <span>{tab.label}</span>
            </Link>
          ))}
          <button
            onClick={() => setDrawerOpen(true)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-medium transition-colors ${
              drawerOpen
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Ellipsis className="size-5" />
            <span>Mais</span>
          </button>
        </div>
      </nav>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Menu</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-1 px-2 pb-4">
            {isAdmin && ADMIN_ITEMS.map((item) => (
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
                <item.icon className="size-5 shrink-0" />
                {item.label}
              </Link>
            ))}
            <Link
              to="/howto"
              preload="intent"
              onClick={() => setDrawerOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
            >
              <HelpCircle className="size-5 shrink-0" />
              Como usar
            </Link>
            <div className="border-t border-border pt-2 mt-2">
              <div className="px-3 pb-2 text-xs text-muted-foreground truncate">
                {userEmail}
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
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
