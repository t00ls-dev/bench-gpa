import { describe, expect, it } from "vitest";
import { isExpectedServerRequestAbort } from "./sentry-error-filter";

const tanStackRequestEvent = {
  exception: {
    values: [{ mechanism: { type: "auto.middleware.tanstackstart.request" } }],
  },
};

describe("isExpectedServerRequestAbort", () => {
  it("filters the connection abort captured by the TanStack request middleware", () => {
    const error = new Error("This operation was aborted");
    error.name = "AbortError";

    expect(isExpectedServerRequestAbort(error, tanStackRequestEvent)).toBe(true);
  });

  it("keeps AbortErrors from other capture mechanisms", () => {
    const error = new Error("This operation was aborted");
    error.name = "AbortError";

    expect(isExpectedServerRequestAbort(error, { exception: { values: [{}] } })).toBe(false);
  });

  it("keeps other errors from the request middleware", () => {
    expect(
      isExpectedServerRequestAbort(new Error("Database request failed"), tanStackRequestEvent),
    ).toBe(false);
  });
});
