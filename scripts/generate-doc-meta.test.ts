import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { generateDocMeta, getGitContentTimestamp } from "./generate-doc-meta";

const roots: string[] = [];

function createRoot(withGit = true): string {
  const root = mkdtempSync(join(tmpdir(), "bench-gpa-doc-meta-"));
  roots.push(root);
  mkdirSync(join(root, "docs"));
  if (withGit) {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "tests@example.com"]);
    git(root, ["config", "user.name", "Tests"]);
  }
  return root;
}

function git(root: string, args: string[], timestamp?: number): string {
  const date = timestamp ? new Date(timestamp * 1000).toISOString() : undefined;
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf-8",
    env: {
      ...process.env,
      ...(date && { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }),
    },
  }).trim();
}

function write(root: string, path: string, content: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function commit(root: string, message: string, timestamp: number): void {
  git(root, ["add", "."]);
  git(root, ["commit", "-m", message], timestamp);
}

function readMeta(root: string): Record<string, number | null> {
  return JSON.parse(readFileSync(join(root, "src/generated/doc-meta.json"), "utf-8")) as Record<
    string,
    number | null
  >;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("generateDocMeta", () => {
  it("uses the latest commit that changed the document blob", () => {
    const root = createRoot();
    write(root, "docs/guide.md", "# Guide\n");
    commit(root, "add guide", 1_700_000_000);

    chmodSync(join(root, "docs/guide.md"), 0o755);
    commit(root, "change mode only", 1_700_000_100);
    write(root, "unrelated.txt", "unrelated\n");
    commit(root, "change unrelated file", 1_700_000_200);

    expect(getGitContentTimestamp(root, "docs/guide.md")).toBe(1_700_000_000);

    write(root, "docs/guide.md", "# Updated guide\n");
    commit(root, "update guide", 1_700_000_300);
    expect(getGitContentTimestamp(root, "docs/guide.md")).toBe(1_700_000_300);
  });

  it("updates paths for additions, removals, and renames without treating a rename as content", () => {
    const root = createRoot();
    write(root, "docs/old.md", "# Original\n");
    commit(root, "add original", 1_700_001_000);

    renameSync(join(root, "docs/old.md"), join(root, "docs/new.md"));
    commit(root, "rename original", 1_700_001_100);
    write(root, "docs/second.md", "# Second\n");
    commit(root, "add second", 1_700_001_200);

    generateDocMeta(root);
    expect(readMeta(root)).toEqual({
      "/docs/new.md": 1_700_001_000,
      "/docs/second.md": 1_700_001_200,
    });

    rmSync(join(root, "docs/new.md"));
    generateDocMeta(root);
    expect(readMeta(root)).toEqual({ "/docs/second.md": 1_700_001_200 });
  });

  it("returns null without Git history", () => {
    const root = createRoot(false);
    write(root, "docs/guide.md", "# Guide\n");

    generateDocMeta(root);
    expect(readMeta(root)).toEqual({ "/docs/guide.md": null });
  });

  it("does not rewrite identical generated content", () => {
    const root = createRoot();
    write(root, "docs/guide.md", "# Guide\n");
    commit(root, "add guide", 1_700_002_000);

    expect(generateDocMeta(root).written).toBe(true);
    expect(generateDocMeta(root).written).toBe(false);
  });
});
