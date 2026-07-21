import { createPool } from "mysql2/promise";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";

const pool = createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

const email = "test@gpabr.com";
const name = "Teste";
const password = "Gpa@Test1970";
const hash = await bcrypt.hash(password, 12);
const id = randomUUID();

await pool.query(
  "INSERT INTO users (id, email, name, password, role, is_active) VALUES (?, ?, ?, ?, 'admin', TRUE)",
  [id, email, name, hash],
);

console.log(`Admin criado: ${email} / ${password}`);
await pool.end();
