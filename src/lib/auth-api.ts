import { createServerFn } from "@tanstack/react-start";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getRequest, getCookie, deleteCookie } from "@tanstack/react-start/server";
import db from "./db";
import { z } from "zod";
import { verifyTurnstile, isTurnstileEnabled } from "./turnstile";
import { authLimiter, authAccountLimiter, getClientIp } from "./rate-limit";
import { recordAudit } from "./audit";
import { SESSION_COOKIE, BCRYPT_COST } from "./auth-config";
import { issueSession, resolveSession } from "./session";
import { requireAuthAllowExpiredPassword } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { PasswordSchema } from "./schemas";

const JWT_SECRET = process.env.JWT_SECRET!;

interface UserRow {
  id: string;
  username: string | null;
  employee_id: string | null;
  name: string;
  password: string | null;
  role: string;
  is_active: boolean;
  token_version: number;
}

function clearSessionCookie(): void {
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

const NewPasswordFields = {
  newPassword: PasswordSchema,
  confirmPassword: PasswordSchema,
};

function refinePasswordsMatch<T extends { newPassword: string; confirmPassword: string }>(
  schema: z.ZodType<T>,
) {
  return schema.refine((v) => v.newPassword === v.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });
}

export const login = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        identifier: z.string().trim().min(1),
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
    // Só minúsculas: matrícula é dígitos (case não importa) e username já é
    // normalizado pra minúsculas na criação/migração.
    const identifier = data.identifier.toLowerCase();

    const auditFail = (reason: string, actorId?: string | null, actorUsername?: string | null) =>
      recordAudit({
        action: "auth.login_failed",
        actorId: actorId ?? null,
        actorUsername: actorUsername ?? data.identifier,
        targetType: "session",
        detail: reason,
        ip,
      });

    const rl = authLimiter.check(ip);
    if (!rl.allowed) {
      await auditFail("excesso de tentativas (rate limit)");
      throw new Error("Muitas tentativas de login. Aguarde um minuto.");
    }

    const [rowsRaw] = await db.query(
      "SELECT id, username, employee_id, name, password, role, is_active, token_version FROM users WHERE username = ? OR employee_id = ?",
      [identifier, identifier],
    );
    const rows = rowsRaw as unknown as UserRow[];
    const user = rows[0] ?? null;

    // Balde por conta, chaveado pelo id resolvido (não pela string digitada):
    // protege contra credential stuffing distribuído por vários IPs contra a
    // mesma conta, e alternar entre login por username e por matrícula da
    // MESMA conta não reseta o balde. Conta não encontrada cai para uma chave
    // pelo identificador bruto, mantendo a mesma cobertura contra
    // brute-force de conta inexistente.
    const rlAccount = authAccountLimiter.check(
      user ? `user:${user.id}` : `identifier:${identifier}`,
    );
    if (!rlAccount.allowed) {
      await auditFail("excesso de tentativas na conta (rate limit)", user?.id, user?.username);
      throw new Error("Muitas tentativas de login para esta conta. Aguarde alguns minutos.");
    }

    // Fail-closed: quando o Turnstile está ativo, o token é obrigatório.
    // Omiti-lo não pode ser um atalho para pular o CAPTCHA (credential stuffing).
    if (isTurnstileEnabled() && !data.turnstileToken) {
      await auditFail("Turnstile ausente", user?.id, user?.username);
      throw new Error("Falha na verificação de segurança. Recarregue e tente novamente.");
    }
    if (data.turnstileToken) {
      const turnstileOk = await verifyTurnstile(data.turnstileToken, ip);
      if (!turnstileOk) {
        await auditFail("falha no Turnstile", user?.id, user?.username);
        throw new Error("Falha na verificação de segurança. Recarregue e tente novamente.");
      }
    }

    if (!user) {
      await auditFail("usuário não encontrado");
      throw new Error("Usuário/matrícula ou senha inválidos.");
    }
    if (!user.is_active) {
      await auditFail("usuário inativo", user.id, user.username);
      throw new Error("Usuário inativo. Procure o administrador.");
    }
    if (user.password === null) {
      await auditFail("primeiro acesso pendente", user.id, user.username);
      throw new Error(
        'Esta conta ainda não concluiu o primeiro acesso. Use a opção "Primeiro acesso" abaixo.',
      );
    }
    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) {
      await auditFail("senha incorreta", user.id, user.username);
      throw new Error("Usuário/matrícula ou senha inválidos.");
    }
    issueSession(
      { id: user.id, role: user.role, tokenVersion: user.token_version },
      data.rememberMe,
    );
    await recordAudit({
      action: "auth.login",
      actorId: user.id,
      actorUsername: user.username,
      targetType: "session",
      ip,
    });
    return { ok: true } as const;
  });

export const getMe = createServerFn({ method: "GET" }).handler(async () => {
  const token = getCookie(SESSION_COOKIE);
  try {
    // slide: false (getMe roda a cada navegação, cacheado 60s no guard de
    // rotas) e não deve ter o efeito colateral de reemitir o cookie; quem
    // renova a sessão por atividade é o requireAuth, chamado pelas funções que
    // de fato buscam dados.
    const session = await resolveSession(token, { slide: false });
    return {
      id: session.userId,
      username: session.userUsername,
      employeeId: session.userEmployeeId,
      name: session.userName,
      role: session.userRole,
      passwordChangeRequired: session.passwordChangeRequired,
    };
  } catch {
    return null;
  }
});

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const token = getCookie(SESSION_COOKIE);
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
      const [rowsRaw] = await db.query("SELECT username FROM users WHERE id = ?", [payload.userId]);
      const rows = rowsRaw as unknown as { username: string | null }[];
      // token_version + 1 revoga o JWT no servidor, não só o cookie no
      // navegador (mesmo padrão de resetPassword em admin-users.functions.ts).
      // Sem isto, um token capturado antes do logout (proxy, dispositivo
      // compartilhado, etc.) continuava aceito até expirar sozinho (até 7
      // dias numa sessão "manter conectado", ver auth-config.ts). Efeito
      // colateral aceito: desloga todas as sessões do usuário, não só esta.
      await db.query("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [
        payload.userId,
      ]);
      await recordAudit({
        action: "auth.logout",
        actorId: payload.userId,
        actorUsername: rows[0]?.username ?? null,
        targetType: "session",
      });
    } catch {
      // Token inválido/expirado: nada a revogar nem auditar.
    }
  }
  clearSessionCookie();
  return { ok: true } as const;
});

/**
 * Define a senha de uma conta sem senha (primeiro acesso, ou depois de um
 * reset por admin -- os dois deixam `password` NULL, mesmo estado, mesmo
 * fluxo). Sem sessão: como não há senha pra conferir, o único identificador
 * (username OU matrícula, mesma resolução do login) faz o papel de prova de
 * identidade -- por decisão de produto, um campo só, para não exigir do
 * usuário informação que ele pode não ter em mãos. Como isso é uma prova de
 * identidade mais fraca que username+matrícula juntos, as três camadas de
 * proteção do login continuam obrigatórias aqui: rate limit por IP, por
 * conta (chave = id resolvido) e Turnstile fail-closed.
 */
export const setInitialPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    refinePasswordsMatch(
      z.object({
        identifier: z.string().trim().min(1),
        turnstileToken: z.string().optional(),
        ...NewPasswordFields,
      }),
    ).parse(d),
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const ip = getClientIp(request);
    const identifier = data.identifier.toLowerCase();

    const rl = authLimiter.check(ip);
    if (!rl.allowed) {
      throw new Error("Muitas tentativas. Aguarde um minuto.");
    }

    const [rowsRaw] = await db.query(
      "SELECT id, username, role, password, token_version FROM users WHERE username = ? OR employee_id = ?",
      [identifier, identifier],
    );
    const rows = rowsRaw as unknown as {
      id: string;
      username: string | null;
      role: string;
      password: string | null;
      token_version: number;
    }[];
    const user = rows[0] ?? null;

    const rlAccount = authAccountLimiter.check(
      user ? `user:${user.id}` : `identifier:${identifier}`,
    );
    if (!rlAccount.allowed) {
      throw new Error("Muitas tentativas. Aguarde alguns minutos.");
    }

    if (isTurnstileEnabled() && !data.turnstileToken) {
      throw new Error("Falha na verificação de segurança. Recarregue e tente novamente.");
    }
    if (data.turnstileToken) {
      const turnstileOk = await verifyTurnstile(data.turnstileToken, ip);
      if (!turnstileOk) {
        throw new Error("Falha na verificação de segurança. Recarregue e tente novamente.");
      }
    }

    // Mensagem genérica tanto pra identificador inexistente quanto pra conta
    // que já concluiu o primeiro acesso: não virar oráculo de enumeração de
    // contas (revelar "essa conta já tem senha" já é informação demais).
    if (!user || user.password !== null) {
      await recordAudit({
        action: "auth.first_access_failed",
        actorId: user?.id ?? null,
        actorUsername: user?.username ?? identifier,
        targetType: "session",
        ip,
      });
      throw new Error("Usuário ou matrícula inválidos.");
    }

    const hash = await bcrypt.hash(data.newPassword, BCRYPT_COST);
    await db.query("UPDATE users SET password = ?, password_changed_at = NOW() WHERE id = ?", [
      hash,
      user.id,
    ]);
    // Auto-login: o usuário acabou de provar posse do identificador E
    // escolher a própria senha na mesma requisição, exigir login de novo
    // logo em seguida não ganha segurança nenhuma, só adiciona uma viagem.
    issueSession({ id: user.id, role: user.role, tokenVersion: user.token_version }, false);
    await recordAudit({
      action: "auth.first_access_completed",
      actorId: user.id,
      actorUsername: user.username ?? identifier,
      targetType: "session",
      ip,
    });
    return { ok: true } as const;
  });

/**
 * Troca de senha autenticada: exige a senha atual. Serve tanto a troca
 * voluntária quanto o fluxo forçado por expiração (usuário já autenticou com
 * a senha atual/expirada no login, só precisa confirmá-la de novo) -- por
 * isso usa `requireAuthAllowExpiredPassword`, não o `requireAuth` padrão: é a
 * própria função que resolve o estado de "senha expirada", não pode ser
 * bloqueada por ele.
 */
export const changePassword = createServerFn({ method: "POST" })
  .middleware([requireAuthAllowExpiredPassword, requireRateLimit("auth")])
  .inputValidator((d: unknown) =>
    refinePasswordsMatch(
      z.object({
        currentPassword: z.string().min(1),
        ...NewPasswordFields,
      }),
    ).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [rowsRaw] = await db.query("SELECT password FROM users WHERE id = ?", [context.userId]);
    const rows = rowsRaw as unknown as { password: string | null }[];
    const currentHash = rows[0]?.password ?? null;
    if (currentHash === null || !(await bcrypt.compare(data.currentPassword, currentHash))) {
      throw new Error("Senha atual incorreta.");
    }

    const newHash = await bcrypt.hash(data.newPassword, BCRYPT_COST);
    // token_version + 1 derruba as outras sessões abertas (mesmo padrão do
    // reset por admin). Precisa ler a versão nova de volta pra reemitir a
    // sessão do PRÓPRIO request antes de retornar: sem isso, a aba que
    // acabou de trocar a senha se autodestrói na chamada seguinte (o cookie
    // em mãos carrega a token_version antiga) -- no fluxo forçado por
    // expiração isso é pior ainda, vira um loop de troca-desloga-troca.
    await db.query(
      "UPDATE users SET password = ?, password_changed_at = NOW(), token_version = token_version + 1 WHERE id = ?",
      [newHash, context.userId],
    );
    const [freshRaw] = await db.query("SELECT token_version FROM users WHERE id = ?", [
      context.userId,
    ]);
    const fresh = (freshRaw as unknown as { token_version: number }[])[0];
    issueSession(
      { id: context.userId, role: context.userRole, tokenVersion: fresh.token_version },
      context.persistent,
    );
    await recordAudit({
      action: "auth.password_change",
      actorId: context.userId,
      actorUsername: context.userUsername,
      targetType: "session",
      detail: "sessões anteriores revogadas",
    });
    return { ok: true } as const;
  });
