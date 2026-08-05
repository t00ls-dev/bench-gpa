import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

export const Route = createFileRoute("/_authenticated/area")({
  // Dashboard ranking click-through (Top Depto/Seção/Grupo/Subgrupo): at
  // most one of these comes filled in at a time (the clicked ranking
  // decides the level), plus the store if the Dashboard was filtered to a
  // single store.
  validateSearch: (s: Record<string, unknown>) => ({
    store: typeof s.store === "string" ? s.store : undefined,
    depto: typeof s.depto === "string" ? s.depto : undefined,
    secao: typeof s.secao === "string" ? s.secao : undefined,
    grupo: typeof s.grupo === "string" ? s.grupo : undefined,
    subgrupo: typeof s.subgrupo === "string" ? s.subgrupo : undefined,
  }),
  component: lazy(() => import("./area.page")),
});
