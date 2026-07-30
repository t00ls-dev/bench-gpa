import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { assertAdmin, invalidateAdminCache } from "./admin-utils";
import { recordAudit } from "./audit";
import { BCRYPT_COST } from "./auth-config";
import { z } from "zod";
import bcrypt from "bcrypt";
import db from "./db";
import { EmailSchema, PasswordSchema, RoleEnum, UserIdSchema } from "./schemas";
import { asArray, asRecord, dateTimeStr } from "./api-types";

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireAuth, requireRateLimit()])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [rows] = await db.query(
      "SELECT id, email, name, role, is_active, created_at FROM users ORDER BY created_at DESC",
    );
    return asArray(rows).map((r) => {
      const rec = asRecord(r);
      return {
        id: String(rec.id ?? ""),
        email: String(rec.email ?? ""),
        name: String(rec.name ?? ""),
        role: String(rec.role ?? ""),
        is_active: Boolean(rec.is_active),
        created_at: dateTimeStr(rec.created_at),
      };
    });
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((data: unknown) =>
    z
      .object({
        email: EmailSchema,
        name: z.string().trim().min(1, "Nome obrigatório").max(120),
        password: PasswordSchema,
        role: RoleEnum,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const hash = await bcrypt.hash(data.password, BCRYPT_COST);
    const id = crypto.randomUUID();
    await db.query(
      "INSERT INTO users (id, email, name, password, role, is_active) VALUES (?, ?, ?, ?, ?, TRUE)",
      [id, data.email, data.name, hash, data.role],
    );
    await recordAudit({
      action: "user.create",
      actorId: context.userId,
      actorEmail: context.userEmail,
      targetType: "user",
      targetId: id,
      detail: `criou ${data.email} (${data.role})`,
    });
    return { ok: true, id };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((data: unknown) => z.object({ userId: UserIdSchema, role: RoleEnum }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (context.userId === data.userId && data.role !== "admin") {
      throw new Error("Você não pode remover seu próprio acesso de administrador.");
    }
    await db.query("UPDATE users SET role = ? WHERE id = ?", [data.role, data.userId]);
    invalidateAdminCache(data.userId);
    await recordAudit({
      action: "user.role_change",
      actorId: context.userId,
      actorEmail: context.userEmail,
      targetType: "user",
      targetId: data.userId,
      detail: `novo papel: ${data.role}`,
    });
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((data: unknown) =>
    z.object({ userId: UserIdSchema, isActive: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (context.userId === data.userId && !data.isActive) {
      throw new Error("Você não pode inativar sua própria conta.");
    }
    await db.query("UPDATE users SET is_active = ? WHERE id = ?", [data.isActive, data.userId]);
    invalidateAdminCache(data.userId);
    await recordAudit({
      action: data.isActive ? "user.activate" : "user.deactivate",
      actorId: context.userId,
      actorEmail: context.userEmail,
      targetType: "user",
      targetId: data.userId,
      detail: data.isActive ? "reativou a conta" : "inativou a conta",
    });
    return { ok: true };
  });

export const resetPassword = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((data: unknown) =>
    z.object({ userId: UserIdSchema, password: PasswordSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const hash = await bcrypt.hash(data.password, BCRYPT_COST);
    // token_version + 1 derruba as sessões já abertas com a senha antiga. Sem
    // isto, redefinir a senha de uma conta comprometida não expulsava ninguém:
    // o JWT continuaria aceito até expirar sozinho (até 7 dias, no caso de uma
    // sessão "manter conectado" — ver src/lib/auth-config.ts). Note o
    // contraste com setUserActive, que sempre funcionou — requireAuth relê
    // `is_active` do banco a cada request, e a senha era o único vetor sem essa
    // rede.
    await db.query(
      "UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?",
      [hash, data.userId],
    );
    await recordAudit({
      action: "user.password_reset",
      actorId: context.userId,
      actorEmail: context.userEmail,
      targetType: "user",
      targetId: data.userId,
      detail: "redefiniu a senha (sessões anteriores revogadas)",
    });
    return { ok: true };
  });
