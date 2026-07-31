import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { setCspNonce } from "./lib/csp";
import { ssrLimiter, getClientIp } from "./lib/rate-limit";
import { ServerResponse } from "node:http";

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

function applySecurityHeaders(
  body: string,
  status: number,
  nonce: string,
  extraHeaders?: [string, string][],
): Response {
  setCspNonce(undefined);

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // style-src usa unsafe-inline (não nonce) porque Radix UI (Popover, Select,
    // Tooltip, DropdownMenu) e Recharts injetam `style` inline via JS em tempo de
    // execução pra posicionamento/renderização, sem suportar nonce de CSP. Nonce
    // aqui quebraria posicionamento desses componentes. Risco residual é baixo:
    // diferente de script-src, unsafe-inline em style-src não permite executar JS
    // — só CSS. Ver auditoria MDN Observatory de 30/07/2026 (nota A+/115).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://challenges.cloudflare.com",
    "font-src 'self'",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  const headers: [string, string][] = [
    ["content-type", "text/html; charset=utf-8"],
    ["content-security-policy", csp],
    ["x-frame-options", "DENY"],
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "strict-origin-when-cross-origin"],
    ["permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()"],
    ["strict-transport-security", "max-age=31536000; includeSubDomains"],
    ["cache-control", "no-cache, no-store, must-revalidate"],
  ];

  if (extraHeaders) {
    headers.push(...extraHeaders);
  }

  return new Response(body, { status, headers });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
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
        jsonBody.includes('"unhandled":true') && jsonBody.includes('"message":"HTTPError"');

      if (!handled) {
        const body = await response.text();
        return applySecurityHeaders(body, response.status, nonce);
      }

      console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${jsonBody}`));
      const errNonce = crypto.randomUUID();
      return applySecurityHeaders(renderErrorPage(), 500, errNonce);
    } catch (error) {
      console.error(error);
      const errNonce = crypto.randomUUID();
      return applySecurityHeaders(renderErrorPage(), 500, errNonce);
    }
  },
};
