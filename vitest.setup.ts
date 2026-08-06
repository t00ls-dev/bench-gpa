import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Only actually does anything in component tests (.test.tsx) -- hook/lib
// tests in .test.ts never mount anything, so cleanup() is a no-op there.
afterEach(() => {
  cleanup();
});
