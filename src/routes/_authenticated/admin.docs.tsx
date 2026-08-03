import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { z } from "zod";

const docsSearchSchema = z.object({
  slug: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/admin/docs")({
  validateSearch: docsSearchSchema,
  component: lazy(() => import("./admin.docs.page")),
});
