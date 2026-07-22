import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import jwt from "jsonwebtoken";
import { parse } from "cookie";
import db from "./db";

export interface AuthContext {
  userId: string;
  userRole: string;
  userEmail: string;
}

interface AuthUserRow {
  id: string;
  role: string;
  is_active: boolean;
}

export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) throw new Error("JWT_SECRET not configured");

  const request = getRequest();
  const cookieHeader = request?.headers?.get("cookie") || "";
  const parsed = parse(cookieHeader);
  const token = parsed["session"];
  if (!token) throw new Error("Unauthorized: no session cookie");

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      role: string;
      email: string;
    };

    const [rowsRaw] = await db.query("SELECT id, role, is_active FROM users WHERE id = ?", [
      payload.userId,
    ]);
    const rows = rowsRaw as unknown as AuthUserRow[];
    if (!rows.length || !rows[0].is_active) {
      throw new Error("Unauthorized: user inactive or not found");
    }

    return next({
      context: {
        userId: payload.userId,
        userRole: payload.role,
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
