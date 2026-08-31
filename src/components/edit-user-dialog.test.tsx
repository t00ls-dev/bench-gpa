// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditUserDialog } from "./edit-user-dialog";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

const updateAdminUserMock = vi.fn();
const resetPasswordMock = vi.fn();
vi.mock("@/lib/admin-users.functions", () => ({
  updateAdminUser: (...args: unknown[]) => updateAdminUserMock(...args),
  resetPassword: (...args: unknown[]) => resetPasswordMock(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const target = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  username: "ana",
  employeeId: "1001",
  name: "Ana Silva",
  role: "user",
  is_active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  updateAdminUserMock.mockResolvedValue({ ok: true });
  resetPasswordMock.mockResolvedValue({ ok: true });
});

describe("EditUserDialog", () => {
  it("submits identity, role, and status through one operation", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<EditUserDialog target={target} onClose={onClose} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Ana Souza" } });
    fireEvent.click(screen.getByRole("switch", { name: "Status" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await vi.waitFor(() =>
      expect(updateAdminUserMock).toHaveBeenCalledWith({
        data: {
          userId: target.id,
          username: "ana",
          employeeId: "1001",
          name: "Ana Souza",
          role: "user",
          isActive: false,
        },
      }),
    );
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps password reset separate and requires confirmation", async () => {
    const onSaved = vi.fn();
    render(<EditUserDialog target={target} onClose={vi.fn()} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole("button", { name: "Redefinir senha" }));
    expect(screen.getByText("Redefinir senha?")).toBeInTheDocument();
    expect(resetPasswordMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await vi.waitFor(() =>
      expect(resetPasswordMock).toHaveBeenCalledWith({ data: { userId: target.id } }),
    );
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("requires a name and at least one identifier before saving", () => {
    render(
      <EditUserDialog
        target={{ ...target, username: null, employeeId: null }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });
});
