import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { setCspNonce } from "./lib/csp";
import { ssrLimiter, getClientIp } from "./lib/rate-limit";
import { ServerResponse } from "node:http";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const origWriteHead = ServerResponse.prototype.writeHead;
ServerResponse.prototype.writeHead = function (...args: unknown[]) {
  if (!this.headersSent) {
    const ct = this.getHeader("content-type");
    if (typeof ct === "string" && ct.includes("text/html") && !this.getHeader("cache-control")) {
      this.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  }
  return origWriteHead.apply(this, args as never);
};

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

function applySecurityHeaders(body: string, status: number, nonce: string, extraHeaders?: [string, string][]): Response {
  setCspNonce(undefined);

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://challenges.cloudflare.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
  ].join("; ");

  const headers: [string, string][] = [
    ["content-type", "text/html; charset=utf-8"],
    ["content-security-policy", csp],
    ["x-frame-options", "DENY"],
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "strict-origin-when-cross-origin"],
    ["cache-control", "no-cache, no-store, must-revalidate"],
  ];

  if (extraHeaders) {
    headers.push(...extraHeaders);
  }

  return new Response(body, { status, headers });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

const DEPLOY_DIR = "/home/admin/web/gpa.t00ls.dev/public_html";

async function handleDeploy(request: Request): Promise<Response | null> {
  if (request.method !== "POST") return null;
  const url = new URL(request.url);
  if (url.pathname !== "/deploy") return null;

  const secret = process.env.DEPLOY_SECRET;
  if (!secret) {
    return new Response("Deploy secret not configured", { status: 500 });
  }

  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!timingSafeEqual(auth, secret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const tmpFile = join(tmpdir(), `deploy-${Date.now()}.tar.gz`);
  const tmpDir = join(DEPLOY_DIR, ".output.new");

  try {
    const reader = request.body?.getReader();
    if (!reader) return new Response("No body", { status: 400 });

    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const buf = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      buf.set(chunk, offset);
      offset += chunk.length;
    }
    writeFileSync(tmpFile, buf);

    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
    mkdirSync(tmpDir, { recursive: true });
    execSync(`tar xzf "${tmpFile}" --no-same-owner -C "${tmpDir}"`, { stdio: "pipe" });

    const oldDir = join(DEPLOY_DIR, ".output.old");
    const curDir = join(DEPLOY_DIR, ".output");
    if (existsSync(oldDir)) rmSync(oldDir, { recursive: true });
    if (existsSync(curDir)) renameSync(curDir, oldDir);
    renameSync(tmpDir, curDir);

    if (existsSync(oldDir)) rmSync(oldDir, { recursive: true });

    // PM2 reload — execSync may get SIGINT during graceful shutdown
    for (const cmd of ["pm2 reload bench-gpa", "pm2 save"]) {
      try {
        execSync(cmd, { stdio: "pipe", timeout: 10_000 });
      } catch (reloadErr) {
        const sig = (reloadErr as { signal?: string }).signal;
        if (sig !== "SIGINT") {
          console.error(`${cmd} failed:`, reloadErr);
          throw reloadErr;
        }
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Deploy failed:", err);
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
    return new Response("Deploy failed: " + (err as Error).message, { status: 500 });
  } finally {
    try { rmSync(tmpFile); } catch { /* ignore */ }
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const deployResp = await handleDeploy(request);
    if (deployResp) return deployResp;

    const ip = getClientIp(request);
    const rl = ssrLimiter.check(ip);
    if (!rl.allowed) {
      return new Response("Muitas requisições. Aguarde um momento.", {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          "content-type": "text/plain; charset=utf-8",
        },
      });
    }

    try {
      const url = new URL(request.url);
      const isServerFn = url.pathname.startsWith("/_serverFn/");
      if (isServerFn) {
        const handler = await getServerEntry();
        return await handler.fetch(request, env, ctx);
      }

      const nonce = crypto.randomUUID();
      setCspNonce(nonce);
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);

      if (response.status < 500) {
        const body = await response.text();
        const location = response.headers.get("location");
        const extraHeaders: [string, string][] = [];
        if (location) {
          extraHeaders.push(["location", location]);
        }
        return applySecurityHeaders(body, response.status, nonce, extraHeaders);
      }

      const jsonBody = await response.clone().text();
      const handled =
        jsonBody.includes('"unhandled":true') &&
        jsonBody.includes('"message":"HTTPError"');

      if (!handled) {
        const body = await response.text();
        return applySecurityHeaders(body, response.status, nonce);
      }

      console.error(
        consumeLastCapturedError() ??
          new Error(`h3 swallowed SSR error: ${jsonBody}`),
      );
      const errNonce = crypto.randomUUID();
      return applySecurityHeaders(renderErrorPage(), 500, errNonce);
    } catch (error) {
      console.error(error);
      const errNonce = crypto.randomUUID();
      return applySecurityHeaders(renderErrorPage(), 500, errNonce);
    }
  },
};
