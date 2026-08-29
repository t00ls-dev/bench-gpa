import { describe, expect, it } from "vitest";
import {
  attachSentryContext,
  getSentryContext,
  isExpectedError,
  markExpectedError,
} from "./sentry-error-metadata";

describe("Sentry error metadata", () => {
  it("marks only the selected error instance as expected", () => {
    const expected = markExpectedError(new Error("expected"));

    expect(isExpectedError(expected)).toBe(true);
    expect(isExpectedError(new Error("unexpected"))).toBe(false);
  });

  it("attaches structured diagnostic context without changing the message", () => {
    const error = attachSentryContext(new Error("integrity failure"), "import_integrity", {
      batch_id: "batch-1",
      expected_rows: 500,
      staging_rows: 499,
    });

    expect(error.message).toBe("integrity failure");
    expect(getSentryContext(error)).toEqual({
      name: "import_integrity",
      values: { batch_id: "batch-1", expected_rows: 500, staging_rows: 499 },
    });
  });
});
