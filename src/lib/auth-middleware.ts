import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import jwt from "jsonwebtoken";
import { parse } from "cookie";
import db from "./db";
import { SESSION_COOKIE } from "./auth-config";

export interface AuthContext {
  userId: string;
  userRole: string;
  userEmail: string;
}

interface AuthUserRow {
  id: string;
  role: string;
  is_active: boolean;
  token_version: number;
}

export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) throw new Error("JWT_SECRET not configured");

  const request = getRequest();
  const cookieHeader = request?.headers?.get("cookie") || "";
  const parsed = parse(cookieHeader);
  const token = parsed[SESSION_COOKIE];
  if (!token) throw new Error("Unauthorized: no session cookie");

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      role: string;
      email: string;
      tokenVersion?: number;
    };

    const [rowsRaw] = await db.query(
      "SELECT id, role, is_active, token_version FROM users WHERE id = ?",
      [payload.userId],
    );
    const rows = rowsRaw as unknown as AuthUserRow[];
    if (!rows.length || !rows[0].is_active) {
      throw new Error("Unauthorized: user inactive or not found");
    }

    // Sessão revogada: resetPassword incrementa token_version, então todo token
    // emitido antes do reset para de valer aqui — sem isto o JWT continuaria
    // aceito por até 7 dias (JWT_EXPIRY) depois de trocada a senha.
    //
    // `?? 0` cobre os tokens emitidos antes desta coluna existir: eles não têm
    // o campo no payload e a coluna nasce em 0, então seguem válidos até
    // expirar naturalmente em vez de deslogar todo mundo no deploy.
    if ((payload.tokenVersion ?? 0) !== rows[0].token_version) {
      throw new Error("Unauthorized: session revoked");
    }

    return next({
      context: {
        userId: payload.userId,
        // role vem do BANCO, não do payload: o JWT carrega o papel congelado na
        // emissão, então um usuário rebaixado seguiria com `userRole: "admin"`
        // no contexto por até 7 dias. Hoje nada decide privilégio por este
        // campo (assertAdmin refaz a consulta via has_role), mas ele existe e
        // seria uma armadilha para o próximo uso.
        userRole: rows[0].role,
        userEmail: payload.email,
      } satisfies AuthContext,
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Unauthorized")) {
      throw err;
    }
    throw new Error("Unauthorized: invalid token");
  }
});
