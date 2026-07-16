import { Outlet } from "@tanstack/react-router";
import { AdminGate } from "@/components/admin-gate";

export default function AdminLayout() {
  return (
    <AdminGate isAdmin={true}>
      <Outlet />
    </AdminGate>
  );
}
