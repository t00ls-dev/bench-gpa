import { createPool } from "mysql2/promise";
import { createInterface } from "node:readline/promises";

// Espelha o charset que UsernameSchema/MatriculaSchema (src/lib/schemas.ts,
// introduzidas na refatoração de auth que usa este script) vão validar: um
// valor nunca pode ser interpretável como as duas coisas ao mesmo tempo, senão
// o `WHERE username = ? OR matricula = ?` do login fica ambíguo. Duplicado
// aqui (em vez de importado) porque este script roda antes daquele PR existir
// em produção -- é a classificação que o e-mail legado já continha, não uma
// regra nova.
const DIGITS_ONLY = /^\d+$/;
const USERNAME_CHARSET = /^[a-z0-9._-]+$/;

interface UserRow {
  id: string;
  email: string;
  username: string | null;
  matricula: string | null;
}

interface Classification {
  id: string;
  email: string;
  username: string | null;
  matricula: string | null;
  outOfCharset: boolean;
}

function classify(email: string): {
  username: string | null;
  matricula: string | null;
  outOfCharset: boolean;
} {
  const at = email.indexOf("@");
  const localPart = at === -1 ? email : email.slice(0, at);

  if (DIGITS_ONLY.test(localPart)) {
    return { username: null, matricula: localPart, outOfCharset: false };
  }

  const candidate = localPart.toLowerCase();
  if (USERNAME_CHARSET.test(candidate)) {
    return { username: candidate, matricula: null, outOfCharset: false };
  }

  return { username: null, matricula: null, outOfCharset: true };
}

function findDuplicates(values: (string | null)[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (v === null) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  for (const [k, count] of counts) {
    if (count <= 1) counts.delete(k);
  }
  return counts;
}

/** IDs cujo username OU matrícula classificados colidem com outra linha --
 * não podem ser aplicados (violariam o UNIQUE do banco), precisam ficar
 * pendentes de correção manual do admin em vez de derrubar a transação
 * inteira. */
function conflictingIds(classifications: Classification[]): Set<string> {
  const usernameDupes = findDuplicates(classifications.map((c) => c.username));
  const matriculaDupes = findDuplicates(classifications.map((c) => c.matricula));
  const ids = new Set<string>();
  for (const c of classifications) {
    if (c.username !== null && usernameDupes.has(c.username)) ids.add(c.id);
    if (c.matricula !== null && matriculaDupes.has(c.matricula)) ids.add(c.id);
  }
  return ids;
}

function printReport(classifications: Classification[], applied: boolean): void {
  const withUsername = classifications.filter((c) => c.username !== null);
  const withMatricula = classifications.filter((c) => c.matricula !== null);
  const outOfCharset = classifications.filter((c) => c.outOfCharset);
  const usernameDupes = findDuplicates(classifications.map((c) => c.username));
  const matriculaDupes = findDuplicates(classifications.map((c) => c.matricula));

  console.log(`=== Migração users -> username/matricula (${applied ? "APLICADO" : "DRY RUN"}) ===`);
  console.log(`Total de usuários: ${classifications.length}`);
  console.log("");
  console.log(`Classificados como username (não numérico): ${withUsername.length}`);
  console.log(`Classificados como matrícula (só dígitos):    ${withMatricula.length}`);
  console.log(
    `Pendentes de username (ficará NULL):          ${classifications.length - withUsername.length}`,
  );
  console.log(
    `Pendentes de matrícula (ficará NULL):         ${classifications.length - withMatricula.length}`,
  );
  console.log("");

  if (usernameDupes.size === 0 && matriculaDupes.size === 0) {
    console.log("Conflitos detectados: 0");
  } else {
    console.log(`Conflitos detectados: ${usernameDupes.size + matriculaDupes.size}`);
    for (const [value, count] of usernameDupes) {
      console.log(`  - username "${value}" repetido em ${count} contas:`);
      for (const c of classifications.filter((x) => x.username === value)) {
        console.log(`      ${c.id}  ${c.email}`);
      }
    }
    for (const [value, count] of matriculaDupes) {
      console.log(`  - matrícula "${value}" repetida em ${count} contas:`);
      for (const c of classifications.filter((x) => x.matricula === value)) {
        console.log(`      ${c.id}  ${c.email}`);
      }
    }
  }
  console.log("");

  console.log(
    `Fora do charset esperado (não classificável automaticamente): ${outOfCharset.length}`,
  );
  for (const c of outOfCharset) {
    console.log(`  - ${c.id}  ${c.email}`);
  }
  console.log("");

  if (!applied) {
    console.log(">>> Nenhuma escrita foi feita. Rode com --apply para aplicar. <<<");
  }
}

async function main(): Promise<void> {
  const mode = process.argv.includes("--apply")
    ? "apply"
    : process.argv.includes("--dry-run")
      ? "dry-run"
      : null;

  if (!mode) {
    console.error("Uso: bun run scripts/migrate-users-to-username.ts --dry-run | --apply");
    process.exitCode = 1;
    return;
  }

  const pool = createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });

  try {
    const [rowsRaw] = await pool.query(
      "SELECT id, email, username, matricula FROM users ORDER BY email",
    );
    const rows = rowsRaw as unknown as UserRow[];

    // Só classifica o campo que ainda está NULL: torna o script seguro de
    // rodar mais de uma vez sem sobrescrever uma correção manual já feita
    // pelo admin (ex.: via updateUserIdentifiers, depois que aquele PR
    // existir).
    const classifications: Classification[] = rows.map((row) => {
      const derived = classify(row.email);
      return {
        id: row.id,
        email: row.email,
        username: row.username ?? derived.username,
        matricula: row.matricula ?? derived.matricula,
        outOfCharset: row.username === null && row.matricula === null && derived.outOfCharset,
      };
    });

    if (mode === "dry-run") {
      printReport(classifications, false);
      return;
    }

    printReport(classifications, false);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      "\nRevisou o relatório acima? Digite SIM (maiúsculas) para aplicar contra o banco: ",
    );
    rl.close();
    if (answer.trim() !== "SIM") {
      console.log("Cancelado. Nenhuma escrita foi feita.");
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const conflicts = conflictingIds(classifications);
      const pending: string[] = [];
      for (const c of classifications) {
        if (conflicts.has(c.id)) {
          pending.push(c.id);
          continue;
        }
        const original = rows.find((r) => r.id === c.id)!;
        const usernameChanged = c.username !== null && original.username === null;
        const matriculaChanged = c.matricula !== null && original.matricula === null;
        if (!usernameChanged && !matriculaChanged) {
          if (c.outOfCharset) pending.push(c.id);
          continue;
        }
        await conn.query("UPDATE users SET username = ?, matricula = ? WHERE id = ?", [
          usernameChanged ? c.username : original.username,
          matriculaChanged ? c.matricula : original.matricula,
          c.id,
        ]);
      }
      await conn.commit();
      console.log("");
      printReport(classifications, true);
      if (pending.length > 0) {
        console.log(`Pendências que precisam de correção manual do admin: ${pending.join(", ")}`);
      }
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } finally {
    await pool.end();
  }
}

await main();
