import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

export const Route = createFileRoute("/_authenticated/area")({
  // Click-through do ranking do Dashboard (Top Depto/Seção/Grupo/Subgrupo):
  // no máximo um desses vem preenchido por vez (o ranking clicado decide o
  // nível), mais a loja se o Dashboard estava filtrado numa loja só.
  validateSearch: (s: Record<string, unknown>) => ({
    store: typeof s.store === "string" ? s.store : undefined,
    depto: typeof s.depto === "string" ? s.depto : undefined,
    secao: typeof s.secao === "string" ? s.secao : undefined,
    grupo: typeof s.grupo === "string" ? s.grupo : undefined,
    subgrupo: typeof s.subgrupo === "string" ? s.subgrupo : undefined,
  }),
  component: lazy(() => import("./area.page")),
});
