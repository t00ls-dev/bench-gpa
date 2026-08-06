import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The state is now a fixed directory on disk (needs to be the same path
// across processes/workers, see the comment in pdf-download-store.ts), no
// longer a module-level Map: vi.resetModules() alone no longer isolates
// one test from another, so it clears the directory before each test.
// Still keeps resetModules()/dynamic import, for consistency with the
// project's pattern for singleton module state.
const DIR = join(tmpdir(), "bench-gpa-pdf-downloads");

async function freshStore() {
  vi.resetModules();
  const mod = await import("./pdf-download-store");
  return mod;
}

const BYTES = new Uint8Array([1, 2, 3, 4]);

describe("pdf-download-store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the same bytes/filename that were stored, for the same user", async () => {
    const { storePdf, takePdf } = await freshStore();
    const token = storePdf("user-1", BYTES, "relatorio.pdf");
    const entry = takePdf(token, "user-1");
    expect(entry?.bytes).toEqual(BYTES);
    expect(entry?.filename).toBe("relatorio.pdf");
  });

  // Regression from a real bug (08/01/2026): the token used to be
  // single-use, and Firefox makes more than one request to the download
  // URL before saving: the second read came back empty (404 "Not found"
  // saved as if it were the PDF). Short TTL + per-user isolation are
  // already enough protection; the token doesn't also need to die on the
  // first read.
  it("allows reading the same token more than once within the TTL", async () => {
    const { storePdf, takePdf } = await freshStore();
    const token = storePdf("user-1", BYTES, "relatorio.pdf");
    expect(takePdf(token, "user-1")).toBeDefined();
    expect(takePdf(token, "user-1")).toBeDefined();
    expect(takePdf(token, "user-1")).toBeDefined();
  });

  it("a nonexistent token returns undefined", async () => {
    const { takePdf } = await freshStore();
    expect(takePdf("token-que-nunca-existiu", "user-1")).toBeUndefined();
  });

  // Per-user isolation: same token, wrong user, isn't just theory, it's
  // the only thing stopping someone from guessing another export's token.
  it("returns nothing for a userId different from the one that generated the token", async () => {
    const { storePdf, takePdf } = await freshStore();
    const token = storePdf("user-1", BYTES, "relatorio.pdf");
    expect(takePdf(token, "user-2")).toBeUndefined();
  });

  it("an attempt with the wrong userId does not invalidate the token for the right user afterward", async () => {
    const { storePdf, takePdf } = await freshStore();
    const token = storePdf("user-1", BYTES, "relatorio.pdf");
    expect(takePdf(token, "user-2")).toBeUndefined(); // wrong
    expect(takePdf(token, "user-1")).toBeDefined(); // right, still valid
  });

  it("expires after the TTL, a valid but old token returns nothing", async () => {
    const { storePdf, takePdf } = await freshStore();
    const token = storePdf("user-1", BYTES, "relatorio.pdf");
    vi.advanceTimersByTime(61_000);
    expect(takePdf(token, "user-1")).toBeUndefined();
  });

  it("stays valid within the TTL", async () => {
    const { storePdf, takePdf } = await freshStore();
    const token = storePdf("user-1", BYTES, "relatorio.pdf");
    vi.advanceTimersByTime(59_000);
    expect(takePdf(token, "user-1")).toBeDefined();
  });

  it("tokens from different calls don't collide, even for the same user", async () => {
    const { storePdf, takePdf } = await freshStore();
    const t1 = storePdf("user-1", new Uint8Array([1]), "a.pdf");
    const t2 = storePdf("user-1", new Uint8Array([2]), "b.pdf");
    expect(t1).not.toBe(t2);
    expect(takePdf(t1, "user-1")?.filename).toBe("a.pdf");
    expect(takePdf(t2, "user-1")?.filename).toBe("b.pdf");
  });

  // Covers the very reason for the change: two different "processes"
  // (here, two module instances via separate dynamic import, without
  // resetModules() between them) seeing the same token through disk.
  it("a token written by one module instance is read by another", async () => {
    const store1 = await freshStore();
    const token = store1.storePdf("user-1", BYTES, "relatorio.pdf");

    vi.resetModules();
    const store2 = await import("./pdf-download-store");
    const entry = store2.takePdf(token, "user-1");
    expect(entry?.bytes).toEqual(BYTES);
    expect(entry?.filename).toBe("relatorio.pdf");
  });

  it("a token with an invalid format (non-UUID) returns undefined, without trying to read a file", async () => {
    const { takePdf } = await freshStore();
    expect(takePdf("../../etc/passwd", "user-1")).toBeUndefined();
    expect(takePdf("token-qualquer", "user-1")).toBeUndefined();
  });
});
