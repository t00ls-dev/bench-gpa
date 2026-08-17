#!/usr/bin/env bun
import { execSync } from "child_process";
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

function getGitTimestamp(filePath: string): number | null {
  try {
    const output = execSync(`git log -1 --format=%ct -- "${filePath}"`, {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    return output ? Number(output) : null;
  } catch {
    return null;
  }
}

const root = resolve(import.meta.dir, "..");
const docsDir = join(root, "docs");
const files = walk(docsDir, root).sort();
const meta: Meta = {};

for (const file of files) {
  meta[`/${file}`] = getGitTimestamp(file);
}

const outDir = join(root, "src/generated");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const outFile = join(outDir, "doc-meta.json");
const nextContent = JSON.stringify(meta, null, 2) + "\n";
const currentContent = existsSync(outFile) ? readFileSync(outFile, "utf-8") : null;
if (currentContent !== nextContent) writeFileSync(outFile, nextContent);

console.error(`doc-meta.json generated (${Object.keys(meta).length} entries)`);
