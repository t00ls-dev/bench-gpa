#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

type Meta = Record<string, number | null>;

function walk(dir: string, base: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full, base));
    } else if (entry.name.endsWith(".md")) {
      files.push(relative(base, full));
    }
  }
  return files;
}

export function getGitContentTimestamp(root: string, filePath: string): number | null {
  try {
    const output = execFileSync(
      "git",
      [
        "log",
        "--follow",
        "--format=commit:%ct",
        "--raw",
        "--no-abbrev",
        "--find-renames",
        "--",
        filePath,
      ],
      {
        cwd: root,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      },
    );

    let commitTimestamp: number | null = null;
    for (const line of output.split("\n")) {
      if (line.startsWith("commit:")) {
        commitTimestamp = Number(line.slice("commit:".length));
        continue;
      }

      // Blob IDs encode file content only, so equal IDs identify mode-only
      // changes and content-preserving renames even when Git reports the path.
      const rawChange = line.match(/^:\d+ \d+ ([0-9a-f]+) ([0-9a-f]+) /);
      if (commitTimestamp !== null && rawChange && rawChange[1] !== rawChange[2]) {
        return commitTimestamp;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function generateDocMeta(root: string): { entries: number; written: boolean } {
  const docsDir = join(root, "docs");
  const files = walk(docsDir, root).sort();
  const meta: Meta = {};

  for (const file of files) {
    meta[`/${file}`] = getGitContentTimestamp(root, file);
  }

  const outDir = join(root, "src/generated");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const outFile = join(outDir, "doc-meta.json");
  const nextContent = JSON.stringify(meta, null, 2) + "\n";
  const currentContent = existsSync(outFile) ? readFileSync(outFile, "utf-8") : null;
  const written = currentContent !== nextContent;
  if (written) writeFileSync(outFile, nextContent);

  return { entries: Object.keys(meta).length, written };
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..");
  const result = generateDocMeta(root);
  console.error(
    `doc-meta.json ${result.written ? "updated" : "unchanged"} (${result.entries} entries)`,
  );
}
