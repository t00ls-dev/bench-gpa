import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Guarda os bytes de um PDF por pouco tempo, entre o POST que os envia e o GET
 * que os baixa de volta: a ponte que faz `/api/pdf-download` (server.ts)
 * devolver um `Content-Disposition: attachment; filename=...` de verdade, em
 * vez de depender do atributo `download` numa blob URL do lado do cliente
 * (Firefox não confia nesse atributo pra blob: em vários casos, o
 * gerenciador de download cai pro UUID da própria blob URL como nome. Ver
 * Mozilla Bugzilla #1282407).
 *
 * Em arquivo, não em memória: PM2 em cluster mode roda mais de um processo
 * Node atendendo a mesma porta, e o POST que grava pode cair num worker
 * diferente do GET que busca. Como os dois só precisam se enxergar dentro do
 * mesmo host (não entre máquinas), um diretório compartilhado no disco local
 * resolve sem precisar de Redis nem de gravar PDF inteiro como BLOB no banco
 * (dado transiente de 60s, sem motivo pra pesar no binlog do MariaDB).
 *
 * NÃO é uso único, de propósito: já foi (bug real, corrigido em 01/08/2026):
 * o Firefox faz mais de uma requisição pra URL de download antes de salvar o
 * arquivo (confirmado com um caso real: a segunda leitura vinha com o token
 * já apagado pela primeira, e o Firefox salvava o corpo do 404 ("Not found",
 * 9 bytes) como se fosse o PDF). TTL curto (60s) + isolamento por usuário já
 * bastam como proteção; um token só vale pra quem gerou e só por pouco tempo,
 * não precisa também morrer na primeira leitura. `takePdf` nunca apaga
 * arquivo: só `cleanupExpired` (chamado a cada `storePdf`) remove o que já
 * passou do TTL.
 */

interface Meta {
  userId: string;
  filename: string;
  expiresAt: number;
}

const TTL_MS = 60_000;
const DIR = join(tmpdir(), "bench-gpa-pdf-downloads");
// crypto.randomUUID() sempre bate com isto: a checagem existe pro token vindo
// da URL (entrada de fora) em takePdf, não pra confiar no que a gente mesmo gera.
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

mkdirSync(DIR, { recursive: true });

function metaPath(token: string): string {
  return join(DIR, `${token}.meta.json`);
}

function binPath(token: string): string {
  return join(DIR, `${token}.bin`);
}

function cleanupExpired(): void {
  const now = Date.now();
  let files: string[];
  try {
    files = readdirSync(DIR);
  } catch {
    return;
  }
  for (const file of files) {
    if (!file.endsWith(".meta.json")) continue;
    const token = file.slice(0, -".meta.json".length);
    let expired: boolean;
    try {
      const meta = JSON.parse(readFileSync(metaPath(token), "utf8")) as Meta;
      expired = now > meta.expiresAt;
    } catch {
      // meta corrompido ou sumiu no meio da leitura: trata como expirado, não
      // deixa lixo órfão acumulando no diretório.
      expired = true;
    }
    if (!expired) continue;
    try {
      unlinkSync(metaPath(token));
    } catch {
      // já não existe, tanto faz
    }
    try {
      unlinkSync(binPath(token));
    } catch {
      // já não existe, tanto faz
    }
  }
}

export function storePdf(userId: string, bytes: Uint8Array, filename: string): string {
  cleanupExpired();
  const token = randomUUID();
  const meta: Meta = { userId, filename, expiresAt: Date.now() + TTL_MS };
  writeFileSync(metaPath(token), JSON.stringify(meta));
  writeFileSync(binPath(token), bytes);
  return token;
}

export function takePdf(
  token: string,
  userId: string,
): { bytes: Uint8Array; filename: string } | undefined {
  if (!TOKEN_RE.test(token) || !existsSync(metaPath(token))) return undefined;

  let meta: Meta;
  try {
    meta = JSON.parse(readFileSync(metaPath(token), "utf8")) as Meta;
  } catch {
    return undefined;
  }
  if (meta.userId !== userId || Date.now() > meta.expiresAt) return undefined;

  try {
    return { bytes: new Uint8Array(readFileSync(binPath(token))), filename: meta.filename };
  } catch {
    return undefined;
  }
}
