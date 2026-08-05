import { createPool } from "mysql2/promise";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { BCRYPT_COST } from "../src/lib/auth-config";

const pool = createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

const username = "test";
const employeeId = "00001";
const name = "Teste";
const password = "Gpa@Test1970";
const hash = await bcrypt.hash(password, BCRYPT_COST);
const id = randomUUID();

// Explicit password_changed_at = NOW(): without this the account would be
// created with an "expired" password (password_changed_at NULL), triggering
// the mandatory-change gate on every manual/E2E check that logs in with this user.
await pool.query(
  "INSERT INTO users (id, username, employee_id, name, password, role, is_active, password_changed_at) VALUES (?, ?, ?, ?, ?, 'admin', TRUE, NOW())",
  [id, username, employeeId, name, hash],
);

console.log(`Admin criado: ${username} (matrícula ${employeeId}) / ${password}`);
await pool.end();
