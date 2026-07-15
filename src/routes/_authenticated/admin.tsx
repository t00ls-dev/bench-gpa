import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/components/admin-gate";

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
  component: () => (
    <AdminGate isAdmin={true}>
      <Outlet />
    </AdminGate>
  ),
});
