import { createServerFn } from "@tanstack/react-start";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getRequest, getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import db from "./db";
import { z } from "zod";
import { verifyTurnstile, isTurnstileEnabled } from "./turnstile";
import { authLimiter, getClientIp } from "./rate-limit";
import { recordAudit } from "./audit";

const JWT_SECRET = process.env.JWT_SECRET!;
const SESSION_COOKIE = "session";
const JWT_EXPIRY_SECONDS = Number(process.env.JWT_EXPIRY) || 7 * 24 * 60 * 60;

interface UserRow {
  id: string;
  email: string;
  name: string;
  password: string;
  role: string;
  is_active: boolean;
  token_version: number;
}

function setSessionCookie(token: string): void {
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    path: "/",
    maxAge: JWT_EXPIRY_SECONDS,
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

    const auditFail = (reason: string, actorId?: string) =>
      recordAudit({
        action: "auth.login_failed",
        actorId: actorId ?? null,
        actorEmail: data.email,
        targetType: "session",
        detail: reason,
        ip,
      });

    const rl = authLimiter.check(ip);
    if (!rl.allowed) {
      await auditFail("excesso de tentativas (rate limit)");
      throw new Error("Muitas tentativas de login. Aguarde um minuto.");
    }

    // Fail-closed: quando o Turnstile está ativo, o token é obrigatório —
    // omiti-lo não pode ser um atalho para pular o CAPTCHA (credential stuffing).
    if (isTurnstileEnabled() && !data.turnstileToken) {
      await auditFail("Turnstile ausente");
      throw new Error("Falha na verificação de segurança. Recarregue e tente novamente.");
    }
    if (data.turnstileToken) {
      const turnstileOk = await verifyTurnstile(data.turnstileToken, ip);
      if (!turnstileOk) {
        await auditFail("falha no Turnstile");
        throw new Error("Falha na verificação de segurança. Recarregue e tente novamente.");
      }
    }

    const [rowsRaw] = await db.query(
      "SELECT id, email, name, password, role, is_active, token_version FROM users WHERE email = ?",
      [data.email],
    );
    const rows = rowsRaw as unknown as UserRow[];
    if (!rows.length) {
      await auditFail("e-mail não cadastrado");
      throw new Error("E-mail ou senha inválidos.");
    }
    const user = rows[0];
    if (!user.is_active) {
      await auditFail("usuário inativo", user.id);
      throw new Error("Usuário inativo. Procure o administrador.");
    }
    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) {
      await auditFail("senha incorreta", user.id);
      throw new Error("E-mail ou senha inválidos.");
    }
    // tokenVersion sela a sessão à senha vigente: resetPassword incrementa a
    // coluna e este token deixa de ser aceito no request seguinte.
    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        email: user.email,
        tokenVersion: user.token_version,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY_SECONDS },
    );
    setSessionCookie(token);
    await recordAudit({
      action: "auth.login",
      actorId: user.id,
      actorEmail: user.email,
      targetType: "session",
      ip,
    });
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
      tokenVersion?: number;
    };
    const [rowsRaw] = await db.query(
      "SELECT id, email, name, role, is_active, token_version FROM users WHERE id = ?",
      [payload.userId],
    );
    const rows = rowsRaw as unknown as UserRow[];
    if (!rows.length || !rows[0].is_active) {
      return null;
    }
    // Mesma checagem de sessão revogada do requireAuth — sem ela o guard das
    // rotas continuaria deixando entrar com um token anterior ao reset de senha.
    if ((payload.tokenVersion ?? 0) !== rows[0].token_version) {
      return null;
    }
    return { id: rows[0].id, email: rows[0].email, name: rows[0].name, role: rows[0].role };
  } catch {
    return null;
  }
});

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const token = getCookie(SESSION_COOKIE);
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
      await recordAudit({
        action: "auth.logout",
        actorId: payload.userId,
        actorEmail: payload.email,
        targetType: "session",
      });
    } catch {
      // Token inválido/expirado — nada a auditar.
    }
  }
  clearSessionCookie();
  return { ok: true } as const;
});
