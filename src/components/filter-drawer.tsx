"use client";

import { useState } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { FilterBar, type Filters } from "@/components/filter-bar";

interface Props {
  value: Filters;
  onChange: (f: Filters) => void;
}

export function FilterDrawer({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const activeCount =
    (value.stores.length > 0 ? 1 : 0) +
    (value.deptos.length > 0 ? 1 : 0) +
    (value.secoes.length > 0 ? 1 : 0) +
    (value.grupos.length > 0 ? 1 : 0) +
    (value.subgrupos.length > 0 ? 1 : 0);

  return (
    <>
      <div className="hidden md:block">
        <FilterBar value={value} onChange={onChange} />
      </div>

      <div className="md:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="w-full gap-2"
        >
          <Filter className="size-4" />
          Filtros
          {activeCount > 0 && (
            <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>

        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Filtros</DrawerTitle>
            </DrawerHeader>
            <div className="max-h-[60vh] overflow-y-auto px-1">
              <FilterBar value={value} onChange={onChange} />
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
}
