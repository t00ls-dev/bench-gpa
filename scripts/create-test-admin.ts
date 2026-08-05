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
const matricula = "00001";
const name = "Teste";
const password = "Gpa@Test1970";
const hash = await bcrypt.hash(password, BCRYPT_COST);
const id = randomUUID();

// password_changed_at = NOW() explícito: sem isso a conta nasceria com senha
// "expirada" (password_changed_at NULL), disparando o gate de troca
// obrigatória em toda verificação manual/E2E que loga com este usuário.
await pool.query(
  "INSERT INTO users (id, username, matricula, name, password, role, is_active, password_changed_at) VALUES (?, ?, ?, ?, ?, 'admin', TRUE, NOW())",
  [id, username, matricula, name, hash],
);

console.log(`Admin criado: ${username} (matrícula ${matricula}) / ${password}`);
await pool.end();
