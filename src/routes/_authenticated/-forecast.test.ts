import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() =>
  vi.fn((options: object) => Object.assign(new Error("redirect"), { options })),
);

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: vi.fn(() => (options: object) => options),
  redirect,
}));
vi.mock("react", () => ({ lazy: vi.fn() }));

import { Route } from "./forecast";

type BeforeLoad = (input: { context: { user?: { role: string } } }) => Promise<void>;

const beforeLoad = (Route as unknown as { beforeLoad: BeforeLoad }).beforeLoad;

describe("forecast route", () => {
  it("allows administrators", async () => {
    await expect(beforeLoad({ context: { user: { role: "admin" } } })).resolves.toBeUndefined();
  });

  it("redirects regular users to the dashboard", async () => {
    await expect(beforeLoad({ context: { user: { role: "user" } } })).rejects.toMatchObject({
      options: { to: "/" },
    });
  });

  it("redirects unauthenticated users to login", async () => {
    await expect(beforeLoad({ context: {} })).rejects.toMatchObject({
      options: { to: "/auth", search: { next: undefined } },
    });
  });
});
