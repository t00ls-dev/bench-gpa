import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ context }) => {
    const u = context.user;
    if (!u) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: u.id,
      _role: "admin",
    });
    if (isAdmin !== true) throw redirect({ to: "/" });
  },
  component: lazy(() => import("./admin.page")),
});
