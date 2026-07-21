import { createServerFn } from "@tanstack/react-start";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { serialize, parse } from "cookie";
import { getRequest } from "@tanstack/react-start/server";
import db from "./db";
import { z } from "zod";
import { verifyTurnstile } from "./turnstile";
import { authLimiter, getClientIp } from "./rate-limit";

const JWT_SECRET = process.env.JWT_SECRET!;

function sessionCookie(token: string): string {
  return serialize("session", token, {
    httpOnly: true,
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

function clearSession(): string {
  return serialize("session", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
}

export const login = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email().transform((e) => e.toLowerCase().trim()),
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

    const [rows] = await db.query<any[]>(
      "SELECT id, email, name, password, role, is_active FROM users WHERE email = ?",
      [data.email],
    );
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
    const token = jwt.sign(
      { userId: user.id, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" },
    );
    return token;
  });

export const getMe = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const cookieHeader = request?.headers?.get("cookie") || "";
  console.log("[getMe] cookie header:", cookieHeader.substring(0, 100));
  const parsed = parse(cookieHeader);
  const token = parsed["session"];
  if (!token) {
    console.log("[getMe] no session cookie found, cookies:", Object.keys(parsed).join(", "));
    return null;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      role: string;
      email: string;
    };
    console.log("[getMe] JWT valid for:", payload.email);
    const [rows] = await db.query<any[]>(
      "SELECT id, email, name, role, is_active FROM users WHERE id = ?",
      [payload.userId],
    );
    if (!rows.length || !rows[0].is_active) {
      console.log("[getMe] user not found or inactive");
      return null;
    }
    return { id: rows[0].id, email: rows[0].email, name: rows[0].name, role: rows[0].role };
  } catch (err) {
    console.log("[getMe] JWT verify error:", err);
    return null;
  }
});

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  return { ok: true, cookie: clearSession() };
});
