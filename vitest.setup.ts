import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Só roda de verdade em testes de componente (.test.tsx) — os testes de
// hook/lib em .test.ts nunca montam nada, então cleanup() é um no-op neles.
afterEach(() => {
  cleanup();
});
