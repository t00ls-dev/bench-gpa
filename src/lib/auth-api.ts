import { createServerFn } from "@tanstack/react-start";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getRequest, getCookie, deleteCookie } from "@tanstack/react-start/server";
import db from "./db";
import { z } from "zod";
import { verifyTurnstile, isTurnstileEnabled } from "./turnstile";
import { authLimiter, authAccountLimiter, getClientIp } from "./rate-limit";
import { recordAudit } from "./audit";
import { SESSION_COOKIE } from "./auth-config";
import { issueSession, resolveSession } from "./session";

const JWT_SECRET = process.env.JWT_SECRET!;

interface UserRow {
  id: string;
  email: string;
  name: string;
  password: string;
  role: string;
  is_active: boolean;
  token_version: number;
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
        // "Manter conectado": sessão fixa de 7 dias em vez da normal (desliza
        // por atividade, teto de 24h). Ver src/lib/auth-config.ts.
        rememberMe: z.boolean().optional().default(false),
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

    // Balde por conta, além do balde por IP acima — protege contra
    // credential stuffing distribuído por vários IPs contra a mesma conta.
    const rlAccount = authAccountLimiter.check(data.email);
    if (!rlAccount.allowed) {
      await auditFail("excesso de tentativas na conta (rate limit)");
      throw new Error("Muitas tentativas de login para esta conta. Aguarde alguns minutos.");
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
    issueSession(
      { id: user.id, role: user.role, email: user.email, tokenVersion: user.token_version },
      data.rememberMe,
    );
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
  try {
    // slide: false — getMe roda a cada navegação (cacheado 60s no guard de
    // rotas) e não deve ter o efeito colateral de reemitir o cookie; quem
    // renova a sessão por atividade é o requireAuth, chamado pelas funções que
    // de fato buscam dados.
    const session = await resolveSession(token, { slide: false });
    return {
      id: session.userId,
      email: session.userEmail,
      name: session.userName,
      role: session.userRole,
    };
  } catch {
    return null;
  }
});

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const token = getCookie(SESSION_COOKIE);
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
      // token_version + 1 revoga o JWT no servidor, não só o cookie no
      // navegador — mesmo padrão de resetPassword (admin-users.functions.ts).
      // Sem isto, um token capturado antes do logout (proxy, dispositivo
      // compartilhado, etc.) continuava aceito até expirar sozinho (até 7
      // dias numa sessão "manter conectado" — auth-config.ts). Efeito
      // colateral aceito: desloga todas as sessões do usuário, não só esta.
      await db.query("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [
        payload.userId,
      ]);
      await recordAudit({
        action: "auth.logout",
        actorId: payload.userId,
        actorEmail: payload.email,
        targetType: "session",
      });
    } catch {
      // Token inválido/expirado — nada a revogar nem auditar.
    }
  }
  clearSessionCookie();
  return { ok: true } as const;
});
