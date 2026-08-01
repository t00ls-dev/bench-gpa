/**
 * Guarda os bytes de um PDF por pouco tempo, entre o POST que os envia e o GET
 * que os baixa de volta — a ponte que faz `/api/pdf-download` (server.ts)
 * devolver um `Content-Disposition: attachment; filename=...` de verdade, em
 * vez de depender do atributo `download` numa blob URL do lado do cliente
 * (Firefox não confia nesse atributo pra blob: em vários casos — o
 * gerenciador de download cai pro UUID da própria blob URL como nome. Ver
 * Mozilla Bugzilla #1282407).
 *
 * NÃO é uso único, de propósito — já foi (bug real, corrigido em 01/08/2026):
 * o Firefox faz mais de uma requisição pra URL de download antes de salvar o
 * arquivo (confirmado com um caso real: a segunda leitura vinha com o token
 * já apagado pela primeira, e o Firefox salvava o corpo do 404 — "Not found",
 * 9 bytes — como se fosse o PDF). TTL curto (60s) + isolamento por usuário já
 * bastam como proteção; um token só vale pra quem gerou e só por pouco tempo,
 * não precisa também morrer na primeira leitura.
 */

interface Entry {
  userId: string;
  bytes: Uint8Array;
  filename: string;
  expiresAt: number;
}

const TTL_MS = 60_000;
const store = new Map<string, Entry>();

function cleanupExpired(): void {
  const now = Date.now();
  for (const [token, entry] of store) {
    if (now > entry.expiresAt) store.delete(token);
  }
}

export function storePdf(userId: string, bytes: Uint8Array, filename: string): string {
  cleanupExpired();
  const token = crypto.randomUUID();
  store.set(token, { userId, bytes, filename, expiresAt: Date.now() + TTL_MS });
  return token;
}

export function takePdf(
  token: string,
  userId: string,
): { bytes: Uint8Array; filename: string } | undefined {
  const entry = store.get(token);
  if (!entry || entry.userId !== userId || Date.now() > entry.expiresAt) return undefined;
  return { bytes: entry.bytes, filename: entry.filename };
}
