import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { assertAdmin, invalidateAdminCache } from "./admin-utils";
import { recordAudit } from "./audit";
import { z } from "zod";
import db from "./db";
import {
  UsernameSchema,
  EmployeeIdSchema,
  RoleEnum,
  UserIdSchema,
  UpdateAdminUserSchema,
} from "./schemas";
import { asArray, asRecord, dateTimeStr } from "./api-types";
import { hasAdminRole } from "./roles";

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireAuth, requireRateLimit()])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [rows] = await db.query(
      "SELECT id, username, employee_id, name, role, is_active, last_login_at, password IS NULL AS pending FROM users ORDER BY name ASC, id ASC",
    );
    return asArray(rows).map((r) => {
      const rec = asRecord(r);
      return {
        id: String(rec.id ?? ""),
        username: rec.username == null ? null : String(rec.username),
        employeeId: rec.employee_id == null ? null : String(rec.employee_id),
        name: String(rec.name ?? ""),
        role: String(rec.role ?? ""),
        is_active: Boolean(rec.is_active),
        // true while the account hasn't completed first access (or was
        // reset by an admin, same state -- see setInitialPassword in
        // auth-api.ts). Computed in the SELECT instead of duplicating the
        // same rule on the client.
        pending: Boolean(rec.pending),
        lastLoginAt: rec.last_login_at == null ? null : dateTimeStr(rec.last_login_at),
      };
    });
  });

// "" and absent are both treated as "not provided": the form sends an empty
// string for the field the admin left blank, not `undefined`.
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((data: unknown) =>
    z
      .object({
        username: z.preprocess(emptyToUndefined, UsernameSchema.optional()),
        employeeId: z.preprocess(emptyToUndefined, EmployeeIdSchema.optional()),
        name: z.string().trim().min(1, "Nome obrigatório").max(120),
        role: RoleEnum,
      })
      // Only 1 of the two is required -- the other stays NULL, the same
      // "pending completion" state that already exists for users migrated
      // from the old email model (see updateAdminUser and
      // edit-user-dialog.tsx).
      .refine((d) => d.username !== undefined || d.employeeId !== undefined, {
        message: "Informe usuário ou matrícula.",
        path: ["username"],
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const id = crypto.randomUUID();
    // password is born NULL: the account only gets a password on first
    // access (setInitialPassword, auth-api.ts). Admin doesn't set any
    // password here -- zero bcrypt.hash in this path.
    await db.query(
      "INSERT INTO users (id, username, employee_id, name, role, is_active) VALUES (?, ?, ?, ?, ?, TRUE)",
      [id, data.username ?? null, data.employeeId ?? null, data.name, data.role],
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

export const resetPassword = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((data: unknown) => z.object({ userId: UserIdSchema }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // Zeroes out password and password_changed_at: same state as a
    // freshly created account, reusing the first-access flow
    // (setInitialPassword) instead of the admin setting a temporary
    // password. token_version + 1 revokes sessions already open with the
    // old password -- without this, the JWT would keep being accepted
    // until it expired on its own (up to 7 days on a "keep me signed in"
    // session).
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

export const updateAdminUser = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((data: unknown) => UpdateAdminUserSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (context.userId === data.userId && !hasAdminRole(data.role)) {
      throw new Error("Você não pode remover seu próprio acesso de administrador.");
    }
    if (context.userId === data.userId && !data.isActive) {
      throw new Error("Você não pode inativar sua própria conta.");
    }
    try {
      await db.query(
        "UPDATE users SET username = ?, employee_id = ?, name = ?, role = ?, is_active = ? WHERE id = ?",
        [
          data.username ?? null,
          data.employeeId ?? null,
          data.name,
          data.role,
          data.isActive,
          data.userId,
        ],
      );
    } catch (err) {
      // ER_DUP_ENTRY: username or employee_id already used by another account.
      if (err && typeof err === "object" && "code" in err && err.code === "ER_DUP_ENTRY") {
        throw new Error("Username ou matrícula já usados por outra conta.", { cause: err });
      }
      throw err;
    }
    invalidateAdminCache(data.userId);
    await recordAudit({
      action: "user.update",
      actorId: context.userId,
      actorUsername: context.userUsername,
      targetType: "user",
      targetId: data.userId,
      detail: `nome: ${data.name}, username: ${data.username ?? "(sem)"}, matrícula: ${data.employeeId ?? "(sem)"}, papel: ${data.role}, ativo: ${data.isActive ? "sim" : "não"}`,
    });
    return { ok: true };
  });
