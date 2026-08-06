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
import { runWithCspNonce } from "./lib/csp-server";
import { ssrLimiter, getClientIp } from "./lib/rate-limit";
import { assertSafeBoot } from "./lib/boot-guards";
import { parseCookie } from "cookie";
import { SESSION_COOKIE } from "./lib/auth-config";
import { resolveSession } from "./lib/session";
import { storePdf, takePdf } from "./lib/pdf-download-store";
import { contentDispositionHeader } from "./lib/content-disposition";
import { ServerResponse } from "node:http";

/**
 * Sentry's same-origin tunnel: /monitoring receives the browser's envelope
 * and forwards it to Sentry from the server itself, instead of the client
 * talking directly to *.sentry.io. Keeps the CSP's connect-src at just
 * 'self' (no third-party domain exposed, no risk of an ad blocker blocking it).
 *
 * A custom implementation instead of Sentry.createSentryTunnelRoute() for
 * two reasons: (1) explicit allowedDsns instead of getClient(), which in a
 * Node runtime with automatic HTTP instrumentation can read the wrong
 * isolated scope; (2) it lets us fix the event's IP before forwarding it.
 * Without that, Sentry would geolocate by the IP of whoever *connects to
 * it* (the VPS itself, always the same city), not whoever generated the
 * error in the browser: the tunnel hides the user's real IP from Sentry by
 * nature, so it has to be injected back manually.
 *
 * parseEnvelope/serializeEnvelope (from @sentry/core itself, used
 * internally by handleTunnelRequest) preserve binary items intact (Session
 * Replay payload, compressed): only the "event" item (JSON) is touched,
 * everything else passes through undecoded.
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

  // getClientIp() falls back to "unknown" when no proxy header arrives
  // (Cloudflare/nginx): never send that as if it were an IP, Sentry
  // validates the format and rejects it ("expected an ip address"), so
  // it's better to leave the field out (an event with no geolocation) than
  // to send garbage.
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
 * Bridge to a real `Content-Disposition: attachment` (see
 * src/lib/pdf-download-store.ts for why): the client generates the PDF
 * (jsPDF, area.page) and comes through here just to get the reliable
 * download header; assembling the PDF itself stays entirely in the browser.
 *
 * Deliberately outside the normal server-function flow (`/_serverFn/`):
 * needs full control over the `Response` (binary body, custom header),
 * which createServerFn's RPC envelope doesn't allow.
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
        // no-transform: tells any proxy/CDN along the way (Nginx,
        // Cloudflare) not to recompress/rewrite the body. A PDF is already
        // internally compressed (FlateDecode streams): a gzip/brotli
        // recompression by a proxy in the middle, if applied back to the
        // client incorrectly, corrupts the internal bytes without breaking
        // the total size or throwing any error: the file opens, but the
        // content comes out unreadable/black.
        "cache-control": "no-store, no-transform",
        "x-content-type-options": "nosniff",
        // Explicit instead of letting the proxy calculate it on its own:
        // another documented source of corruption is a Content-Length that
        // doesn't match the real body after some step along the way
        // recalculates it wrong.
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
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // style-src uses unsafe-inline (not a nonce) because Radix UI (Popover,
    // Select, Tooltip, DropdownMenu) and Recharts inject inline `style` via
    // JS at runtime for positioning/rendering, with no CSP nonce support. A
    // nonce here would break those components' positioning. The residual
    // risk is low: unlike script-src, unsafe-inline in style-src doesn't
    // allow executing JS, only CSS. See the MDN Observatory audit from
    // 07/30/2026 (A+/115 grade).
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
      const handler = await getServerEntry();
      // runWithCspNonce, not a bare setCspNonce: isolates the nonce per
      // async chain (see the comment in src/lib/csp.ts), so concurrent
      // requests don't step on each other during SSR.
      const response = await runWithCspNonce(nonce, () => handler.fetch(request, env, ctx));

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

// wrapFetchWithSentry types the parameter as (request, opts?): generic
// enough to cover a fetch handler for any runtime, not just the
// (request, env, ctx) shape Nitro's node-server preset actually uses here.
// In practice it wraps `.fetch` in a Proxy that forwards the entire
// `arguments` object to the original handler, so the 3 real arguments
// arrive normally; the cast is just to match that more generic type signature.
Sentry.wrapFetchWithSentry(
  serverEntry as unknown as {
    fetch: (request: Request, opts?: unknown) => Response | Promise<Response>;
  },
);

export default serverEntry;
