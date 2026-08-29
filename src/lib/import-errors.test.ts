import { describe, expect, it } from "vitest";
import {
  IMPORT_BUSY_MESSAGE,
  IMPORT_LEASE_LOST_MESSAGE,
  IMPORT_ROW_COUNT_MISMATCH_MESSAGE,
} from "./import-config";
import { mapImportError } from "./import-errors";
import { isExpectedError } from "./sentry-error-metadata";

describe("mapImportError", () => {
  it.each([
    ["IMPORT_IN_PROGRESS", IMPORT_BUSY_MESSAGE],
    ["IMPORT_LEASE_LOST", IMPORT_LEASE_LOST_MESSAGE],
    ["IMPORT_ROW_COUNT_MISMATCH", IMPORT_ROW_COUNT_MISMATCH_MESSAGE],
  ])("maps %s", (databaseMessage, userMessage) => {
    expect(mapImportError(new Error(`SQLSTATE 45000: ${databaseMessage}`)).message).toBe(
      userMessage,
    );
  });

  it("preserves an unrelated Error", () => {
    const error = new Error("connection lost");
    expect(mapImportError(error)).toBe(error);
  });
});

it("marks an occupied import lock as an expected business rejection", () => {
  expect(isExpectedError(mapImportError(new Error("IMPORT_IN_PROGRESS")))).toBe(true);
  expect(isExpectedError(mapImportError(new Error("IMPORT_ROW_COUNT_MISMATCH")))).toBe(false);
});
