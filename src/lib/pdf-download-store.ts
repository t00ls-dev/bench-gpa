import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Holds a PDF's bytes for a short time, between the POST that sends them
 * and the GET that downloads them back: the bridge that makes
 * `/api/pdf-download` (server.ts) return a real
 * `Content-Disposition: attachment; filename=...`, instead of relying on
 * the `download` attribute on a client-side blob URL (Firefox doesn't
 * trust that attribute for blob: URLs in several cases, and its download
 * manager falls back to the blob URL's own UUID as the name. See Mozilla
 * Bugzilla #1282407).
 *
 * On disk, not in memory: PM2 in cluster mode runs more than one Node
 * process serving the same port, and the POST that writes can land on a
 * different worker than the GET that fetches. Since the two only need to
 * see each other within the same host (not across machines), a shared
 * directory on local disk solves it without needing Redis or writing the
 * entire PDF as a BLOB in the database (60s of transient data, no reason
 * to weigh down MariaDB's binlog).
 *
 * Deliberately NOT single-use: it used to be (a real bug, fixed on
 * 08/01/2026): Firefox makes more than one request to the download URL
 * before saving the file (confirmed with a real case: the second read came
 * back with the token already erased by the first, and Firefox saved the
 * body of the 404 ("Not found", 9 bytes) as if it were the PDF). Short TTL
 * (60s) + per-user isolation are already enough protection; a token is
 * only valid for whoever generated it and only for a short time, it
 * doesn't also need to die on the first read. `takePdf` never deletes a
 * file: only `cleanupExpired` (called on every `storePdf`) removes what's
 * already past its TTL.
 */

interface Meta {
  userId: string;
  filename: string;
  expiresAt: number;
}

const TTL_MS = 60_000;
const DIR = join(tmpdir(), "bench-gpa-pdf-downloads");
// crypto.randomUUID() always matches this: the check exists for the token
// coming from the URL (external input) in takePdf, not to distrust what we
// generate ourselves.
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

mkdirSync(DIR, { recursive: true });

function metaPath(token: string): string {
  return join(DIR, `${token}.meta.json`);
}

function binPath(token: string): string {
  return join(DIR, `${token}.bin`);
}

function cleanupExpired(): void {
  const now = Date.now();
  let files: string[];
  try {
    files = readdirSync(DIR);
  } catch {
    return;
  }
  for (const file of files) {
    if (!file.endsWith(".meta.json")) continue;
    const token = file.slice(0, -".meta.json".length);
    let expired: boolean;
    try {
      const meta = JSON.parse(readFileSync(metaPath(token), "utf8")) as Meta;
      expired = now > meta.expiresAt;
    } catch {
      // meta corrupted or disappeared mid-read: treat as expired, don't let
      // orphan garbage pile up in the directory.
      expired = true;
    }
    if (!expired) continue;
    try {
      unlinkSync(metaPath(token));
    } catch {
      // already gone, doesn't matter
    }
    try {
      unlinkSync(binPath(token));
    } catch {
      // already gone, doesn't matter
    }
  }
}

export function storePdf(userId: string, bytes: Uint8Array, filename: string): string {
  cleanupExpired();
  const token = randomUUID();
  const meta: Meta = { userId, filename, expiresAt: Date.now() + TTL_MS };
  writeFileSync(metaPath(token), JSON.stringify(meta));
  writeFileSync(binPath(token), bytes);
  return token;
}

export function takePdf(
  token: string,
  userId: string,
): { bytes: Uint8Array; filename: string } | undefined {
  if (!TOKEN_RE.test(token) || !existsSync(metaPath(token))) return undefined;

  let meta: Meta;
  try {
    meta = JSON.parse(readFileSync(metaPath(token), "utf8")) as Meta;
  } catch {
    return undefined;
  }
  if (meta.userId !== userId || Date.now() > meta.expiresAt) return undefined;

  try {
    return { bytes: new Uint8Array(readFileSync(binPath(token))), filename: meta.filename };
  } catch {
    return undefined;
  }
}
