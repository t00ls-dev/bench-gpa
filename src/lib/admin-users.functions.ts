import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { assertAdmin, invalidateAdminCache } from "./admin-utils";
import { recordAudit } from "./audit";
import { z } from "zod";
import db from "./db";
import { UsernameSchema, MatriculaSchema, RoleEnum, UserIdSchema } from "./schemas";
import { asArray, asRecord, dateTimeStr } from "./api-types";

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireAuth, requireRateLimit()])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [rows] = await db.query(
      "SELECT id, username, matricula, name, role, is_active, created_at, password IS NULL AS pending FROM users ORDER BY created_at DESC",
    );
    return asArray(rows).map((r) => {
      const rec = asRecord(r);
      return {
        id: String(rec.id ?? ""),
        username: rec.username == null ? null : String(rec.username),
        matricula: rec.matricula == null ? null : String(rec.matricula),
        name: String(rec.name ?? ""),
        role: String(rec.role ?? ""),
        is_active: Boolean(rec.is_active),
        // true enquanto a conta não concluiu o primeiro acesso (ou foi
        // resetada por um admin, mesmo estado -- ver setInitialPassword em
        // auth-api.ts). Calculado no SELECT em vez de reimplicar a mesma
        // regra no client.
        pending: Boolean(rec.pending),
        created_at: dateTimeStr(rec.created_at),
      };
    });
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((data: unknown) =>
    z
      .object({
        username: UsernameSchema,
        matricula: MatriculaSchema,
        name: z.string().trim().min(1, "Nome obrigatório").max(120),
        role: RoleEnum,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const id = crypto.randomUUID();
    // password nasce NULL: a conta só ganha senha no primeiro acesso
    // (setInitialPassword, auth-api.ts). Admin não define senha nenhuma
    // aqui -- zero bcrypt.hash neste caminho.
    await db.query(
      "INSERT INTO users (id, username, matricula, name, role, is_active) VALUES (?, ?, ?, ?, ?, TRUE)",
      [id, data.username, data.matricula, data.name, data.role],
    );
    await recordAudit({
      action: "user.create",
      actorId: context.userId,
      actorUsername: context.userUsername,
      targetType: "user",
      targetId: id,
      detail: `papel: ${data.role}`,
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
      actorUsername: context.userUsername,
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
      actorUsername: context.userUsername,
      targetType: "user",
      targetId: data.userId,
    });
    return { ok: true };
  });

export const resetPassword = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((data: unknown) => z.object({ userId: UserIdSchema }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // Zera password e password_changed_at: mesmo estado de uma conta recém
    // criada, reusando o fluxo de primeiro acesso (setInitialPassword) em vez
    // de o admin definir uma senha temporária. token_version + 1 derruba as
    // sessões já abertas com a senha antiga -- sem isto, o JWT continuaria
    // aceito até expirar sozinho (até 7 dias numa sessão "manter conectado").
    await db.query(
      "UPDATE users SET password = NULL, password_changed_at = NULL, token_version = token_version + 1 WHERE id = ?",
      [data.userId],
    );
    await recordAudit({
      action: "user.password_reset",
      actorId: context.userId,
      actorUsername: context.userUsername,
      targetType: "user",
      targetId: data.userId,
      detail: "senha zerada, primeiro acesso obrigatório no próximo login",
    });
    return { ok: true };
  });

export const updateUserIdentifiers = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((data: unknown) =>
    z
      .object({ userId: UserIdSchema, username: UsernameSchema, matricula: MatriculaSchema })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    try {
      await db.query("UPDATE users SET username = ?, matricula = ? WHERE id = ?", [
        data.username,
        data.matricula,
        data.userId,
      ]);
    } catch (err) {
      // ER_DUP_ENTRY: username ou matrícula já usados por outra conta.
      if (err && typeof err === "object" && "code" in err && err.code === "ER_DUP_ENTRY") {
        throw new Error("Username ou matrícula já usados por outra conta.", { cause: err });
      }
      throw err;
    }
    await recordAudit({
      action: "user.identifiers_update",
      actorId: context.userId,
      actorUsername: context.userUsername,
      targetType: "user",
      targetId: data.userId,
      detail: `novo username: ${data.username}, nova matrícula: ${data.matricula}`,
    });
    return { ok: true };
  });
