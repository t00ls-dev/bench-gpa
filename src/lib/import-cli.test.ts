import { describe, expect, it } from "vitest";
import { IMPORT_CHUNK_SIZE } from "./import-config";
import { parseImportChunkSize, parseImportReplace } from "./import-cli";

describe("parseImportChunkSize", () => {
  it("uses the shared chunk size when the option is absent", () => {
    expect(parseImportChunkSize(["sales.xlsx"])).toBe(IMPORT_CHUNK_SIZE);
  });

  it.each(["1", "250", String(IMPORT_CHUNK_SIZE)])("accepts %s rows", (value) => {
    expect(parseImportChunkSize(["sales.xlsx", "--chunk-size", value])).toBe(Number(value));
  });

  it.each([
    ["missing value", ["sales.xlsx", "--chunk-size"]],
    ["another flag as the value", ["sales.xlsx", "--chunk-size", "--user-id", "id"]],
    ["zero", ["sales.xlsx", "--chunk-size", "0"]],
    ["negative", ["sales.xlsx", "--chunk-size", "-1"]],
    ["decimal", ["sales.xlsx", "--chunk-size", "1.5"]],
    ["non-numeric", ["sales.xlsx", "--chunk-size", "abc"]],
    ["above the shared limit", ["sales.xlsx", "--chunk-size", String(IMPORT_CHUNK_SIZE + 1)]],
  ])("rejects %s", (_case, args) => {
    expect(() => parseImportChunkSize(args)).toThrow(
      `--chunk-size must be an integer between 1 and ${IMPORT_CHUNK_SIZE}.`,
    );
  });
});

describe("parseImportReplace", () => {
  it("requires the explicit --replace flag", () => {
    expect(parseImportReplace(["sales.xlsx"])).toBe(false);
    expect(parseImportReplace(["sales.xlsx", "--replace"])).toBe(true);
  });
});
