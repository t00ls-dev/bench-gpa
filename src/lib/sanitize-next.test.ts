import { describe, expect, it } from "vitest";
import { sanitizeNext } from "./sanitize-next";

const ORIGIN = "https://gpa.t00ls.dev";

describe("sanitizeNext", () => {
  it("keeps a plain internal path", () => {
    expect(sanitizeNext("/area", ORIGIN)).toBe("/area");
  });

  it("keeps query string and hash", () => {
    expect(sanitizeNext("/produto?plu=123#top", ORIGIN)).toBe("/produto?plu=123#top");
  });

  it("falls back to / for non-string values", () => {
    expect(sanitizeNext(undefined, ORIGIN)).toBe("/");
    expect(sanitizeNext(null, ORIGIN)).toBe("/");
    expect(sanitizeNext(42, ORIGIN)).toBe("/");
  });

  it("falls back to / for an empty string", () => {
    expect(sanitizeNext("", ORIGIN)).toBe("/");
  });

  it("falls back to / for a protocol-relative URL", () => {
    expect(sanitizeNext("//evil.com", ORIGIN)).toBe("/");
  });

  it("falls back to / for an absolute external URL", () => {
    expect(sanitizeNext("https://evil.com", ORIGIN)).toBe("/");
    expect(sanitizeNext("http://evil.com/path", ORIGIN)).toBe("/");
  });

  // The real bug fixed here: "/\evil.com" passed a naive prefix check
  // (starts with "/", doesn't start with "//"), but the URL parser
  // normalizes "\" to "/" and resolves to an external origin.
  it("falls back to / for a backslash-normalization bypass", () => {
    expect(sanitizeNext("/\\evil.com", ORIGIN)).toBe("/");
    expect(sanitizeNext("\\\\evil.com", ORIGIN)).toBe("/");
  });

  // Same class of bug: tabs/newlines are stripped by the parser before
  // resolving the URL, so "/\t/evil.com" also normalizes to "//evil.com".
  it("falls back to / for a tab/newline-stripping bypass", () => {
    expect(sanitizeNext("/\t/evil.com", ORIGIN)).toBe("/");
    expect(sanitizeNext("/\n/evil.com", ORIGIN)).toBe("/");
  });

  it("falls back to / for a different scheme", () => {
    expect(sanitizeNext("javascript:alert(1)", ORIGIN)).toBe("/");
  });

  it("falls back to / for a value that fails URL parsing entirely", () => {
    expect(sanitizeNext("http://", ORIGIN)).toBe("/");
  });
});
