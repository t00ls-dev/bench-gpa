// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HowToPage from "./howto.page";

const mocks = vi.hoisted(() => ({ role: "user" }));

vi.mock("./howto", () => ({
  Route: {
    useRouteContext: () => ({ user: { role: mocks.role } }),
  },
}));

describe("HowToPage", () => {
  beforeEach(() => {
    mocks.role = "user";
  });

  it("only shows documentation available to a regular user", () => {
    render(<HowToPage />);

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Área" })).toBeInTheDocument();
    expect(screen.getByText(/qualquer usuário autenticado que receba o link/i)).toBeInTheDocument();
    expect(screen.getByText(/recentemente visitadas por até 30 dias/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Importar Dados" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Administração" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Documentação" })).not.toBeInTheDocument();
    expect(screen.queryByText(/páginas administrativas/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dashboard_metrics/i)).not.toBeInTheDocument();
  });

  it("loads administrative documentation for an admin", async () => {
    mocks.role = "admin";
    render(<HowToPage />);

    expect(screen.getByText(/as páginas administrativas ficam na sidebar/i)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Importar Dados" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Administração" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Documentação" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Cache" })).not.toBeInTheDocument();
  });
});
