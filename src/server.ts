import "./lib/instrument-server";
import "./lib/error-capture";

import * as Sentry from "@sentry/tanstackstart-react";
import {
  parseEnvelope,
  serializeEnvelope,
  makeDsn,
  getEnvelopeEndpointWithUrlEncodedAuth,
  type Event as SentryEvent,
} from "@sentry/core";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { setCspNonce } from "./lib/csp";
import { ssrLimiter, getClientIp } from "./lib/rate-limit";
import { assertSafeBoot } from "./lib/boot-guards";
import { parseCookie } from "cookie";
import { SESSION_COOKIE } from "./lib/auth-config";
import { resolveSession } from "./lib/session";
import { storePdf, takePdf } from "./lib/pdf-download-store";
import { contentDispositionHeader } from "./lib/content-disposition";
import { ServerResponse } from "node:http";

/**
 * Tunnel same-origin do Sentry: /monitoring recebe o envelope do navegador e
 * repassa pro Sentry a partir do próprio servidor, em vez do client falar
 * direto com *.sentry.io. Mantém o CSP com connect-src só 'self' (sem expor
 * domínio de terceiro, sem risco de ad-blocker bloquear).
 *
 * Implementação própria em vez de Sentry.createSentryTunnelRoute() por dois
 * motivos: (1) allowedDsns explícito em vez de getClient(), que em runtime
 * Node com instrumentação HTTP automática pode ler o escopo isolado errado;
 * (2) dá pra corrigir o IP do evento antes de repassar. Sem isso, o Sentry
 * geolocalizava pelo IP de quem *conecta com ele* (a própria VPS, sempre a
 * mesma cidade), não de quem gerou o erro no navegador: o tunnel esconde o
 * IP real do usuário do Sentry por natureza, então é preciso injetar de
 * volta manualmente.
 *
 * parseEnvelope/serializeEnvelope (do próprio @sentry/core, usadas
 * internamente por handleTunnelRequest) preservam item binário intacto
 * (payload de Session Replay, comprimido): só o item "event" (JSON) é
 * tocado, tudo mais passa direto sem decodificar.
 */
async function handleSentryTunnel(request: Request, realIp: string): Promise<Response> {
  const bytes = new Uint8Array(await request.arrayBuffer());

  let envelope: ReturnType<typeof parseEnvelope>;
  try {
    envelope = parseEnvelope(bytes);
  } catch {
    return new Response("Invalid envelope", { status: 400 });
  }

  const [envelopeHeader, items] = envelope;
  const dsn = envelopeHeader.dsn;
  if (!dsn || dsn !== process.env.SENTRY_DSN) {
    return new Response("DSN not allowed", { status: 403 });
  }

  const dsnComponents = makeDsn(dsn);
  if (!dsnComponents) {
    return new Response("Invalid DSN", { status: 403 });
  }

  // getClientIp() cai em "unknown" quando nenhum header de proxy chega
  // (Cloudflare/nginx): nunca manda isso como se fosse IP, o Sentry valida o
  // formato e rejeita ("expected an ip address"), então é melhor deixar o
  // campo de fora (evento sem geolocalização) do que mandar lixo.
  if (realIp !== "unknown") {
    for (const [itemHeader, payload] of items) {
      if (itemHeader.type === "event" && payload && typeof payload === "object") {
        const event = payload as SentryEvent;
        event.user = { ...event.user, ip_address: realIp };
      }
    }
  }

  const sentryIngestUrl = getEnvelopeEndpointWithUrlEncodedAuth(dsnComponents);
  try {
    return await fetch(sentryIngestUrl, {
      method: "POST",
      headers: { "content-type": "application/x-sentry-envelope" },
      body: serializeEnvelope(envelope) as BodyInit,
    });
  } catch {
    return new Response("Failed to forward envelope to Sentry", { status: 500 });
  }
}

assertSafeBoot(process.env);

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

/**
 * Ponte pra `Content-Disposition: attachment` de verdade (ver
 * src/lib/pdf-download-store.ts pro porquê): o cliente gera o PDF
 * (jsPDF, área.page) e passa por aqui só pra pegar o header de download
 * confiável; a montagem do PDF em si continua inteiramente no navegador.
 *
 * Fora do fluxo normal de server functions (`/_serverFn/`) de propósito:
 * precisa de controle total do `Response` (corpo binário, header custom),
 * que o envelope RPC de createServerFn não permite.
 */
async function handlePdfDownload(request: Request, url: URL): Promise<Response> {
  const token = parseCookie(request.headers.get("cookie") ?? "")[SESSION_COOKIE];
  const session = await resolveSession(token, { slide: false }).catch(() => null);
  if (!session) return new Response("Unauthorized", { status: 401 });

  if (request.method === "POST" && url.pathname === "/api/pdf-download") {
    const filenameHeader = request.headers.get("x-filename");
    if (!filenameHeader) return new Response("x-filename ausente", { status: 400 });
    const bytes = new Uint8Array(await request.arrayBuffer());
    const downloadToken = storePdf(session.userId, bytes, decodeURIComponent(filenameHeader));
    return Response.json({ url: `/api/pdf-download/${downloadToken}` });
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/pdf-download/")) {
    const downloadToken = url.pathname.slice("/api/pdf-download/".length);
    const entry = takePdf(downloadToken, session.userId);
    if (!entry) return new Response("Not found", { status: 404 });
    return new Response(entry.bytes as BodyInit, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": contentDispositionHeader(entry.filename),
        // no-transform: instrui proxy/CDN no meio do caminho (Nginx, Cloudflare)
        // a não recomprimir/reescrever o corpo. Um PDF já é internamente
        // comprimido (streams FlateDecode): uma recompressão gzip/brotli por
        // um proxy no meio do caminho, se mal aplicada de volta pro cliente,
        // corrompe os bytes internos sem quebrar o tamanho total nem disparar
        // erro nenhum: o arquivo abre, mas o conteúdo sai ilegível/preto.
        "cache-control": "no-store, no-transform",
        "x-content-type-options": "nosniff",
        // Explícito em vez de deixar o proxy calcular sozinho: outra fonte
        // documentada de corrupção é um Content-Length que não bate com o
        // corpo real depois de alguma etapa no meio do caminho recalcular
        // errado.
        "content-length": String(entry.bytes.byteLength),
      },
    });
  }

  return new Response("Not found", { status: 404 });
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
    // diferente de script-src, unsafe-inline em style-src não permite executar JS,
    // só CSS. Ver auditoria MDN Observatory de 30/07/2026 (nota A+/115).
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

const serverEntry: ServerEntry = {
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

      if (url.pathname.startsWith("/api/pdf-download")) {
        return await handlePdfDownload(request, url);
      }

      if (request.method === "POST" && url.pathname === "/monitoring") {
        return await handleSentryTunnel(request, ip);
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

      const swallowedError =
        consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${jsonBody}`);
      console.error(swallowedError);
      Sentry.captureException(swallowedError);
      const errNonce = crypto.randomUUID();
      return applySecurityHeaders(renderErrorPage(), 500, errNonce);
    } catch (error) {
      console.error(error);
      Sentry.captureException(error);
      const errNonce = crypto.randomUUID();
      return applySecurityHeaders(renderErrorPage(), 500, errNonce);
    }
  },
};

// wrapFetchWithSentry tipa o parâmetro como (request, opts?): genérico o
// bastante pra cobrir handler de fetch de qualquer runtime, não só o formato
// (request, env, ctx) que o node-server preset da Nitro realmente usa aqui.
// Na prática ela embrulha `.fetch` num Proxy que repassa `arguments` inteiro
// pro handler original, então os 3 argumentos reais chegam normalmente; o
// cast é só pra bater com essa assinatura mais genérica do tipo.
Sentry.wrapFetchWithSentry(
  serverEntry as unknown as {
    fetch: (request: Request, opts?: unknown) => Response | Promise<Response>;
  },
);

export default serverEntry;
