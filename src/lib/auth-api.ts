import { createServerFn } from "@tanstack/react-start";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getRequest, getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import db from "./db";
import { z } from "zod";
import { verifyTurnstile } from "./turnstile";
import { authLimiter, getClientIp } from "./rate-limit";

const JWT_SECRET = process.env.JWT_SECRET!;
const SESSION_COOKIE = "session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

interface UserRow {
  id: string;
  email: string;
  name: string;
  password: string;
  role: string;
  is_active: boolean;
}

function setSessionCookie(token: string): void {
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    path: "/",
    maxAge: SESSION_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

function clearSessionCookie(): void {
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

export const login = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z
          .string()
          .email()
          .transform((e) => e.toLowerCase().trim()),
        password: z.string().min(1),
        turnstileToken: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const ip = getClientIp(request);

    const rl = authLimiter.check(ip);
    if (!rl.allowed) {
      throw new Error("Muitas tentativas de login. Aguarde um minuto.");
    }

    if (data.turnstileToken) {
      const turnstileOk = await verifyTurnstile(data.turnstileToken, ip);
      if (!turnstileOk) {
        throw new Error("Falha na verificação de segurança. Recarregue e tente novamente.");
      }
    }

    const [rowsRaw] = await db.query(
      "SELECT id, email, name, password, role, is_active FROM users WHERE email = ?",
      [data.email],
    );
    const rows = rowsRaw as unknown as UserRow[];
    if (!rows.length) {
      throw new Error("E-mail ou senha inválidos.");
    }
    const user = rows[0];
    if (!user.is_active) {
      throw new Error("Usuário inativo. Procure o administrador.");
    }
    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) {
      throw new Error("E-mail ou senha inválidos.");
    }
    const token = jwt.sign({ userId: user.id, role: user.role, email: user.email }, JWT_SECRET, {
      expiresIn: "7d",
    });
    setSessionCookie(token);
    return { ok: true } as const;
  });

export const getMe = createServerFn({ method: "GET" }).handler(async () => {
  const token = getCookie(SESSION_COOKIE);
  if (!token) {
    return null;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      role: string;
      email: string;
    };
    const [rowsRaw] = await db.query(
      "SELECT id, email, name, role, is_active FROM users WHERE id = ?",
      [payload.userId],
    );
    const rows = rowsRaw as unknown as UserRow[];
    if (!rows.length || !rows[0].is_active) {
      return null;
    }
    return { id: rows[0].id, email: rows[0].email, name: rows[0].name, role: rows[0].role };
  } catch {
    return null;
  }
});

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  clearSessionCookie();
  return { ok: true } as const;
});
