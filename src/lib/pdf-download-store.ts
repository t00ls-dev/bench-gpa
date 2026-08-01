/**
 * Guarda os bytes de um PDF por pouco tempo, entre o POST que os envia e o GET
 * que os baixa de volta — a ponte que faz `/api/pdf-download` (server.ts)
 * devolver um `Content-Disposition: attachment; filename=...` de verdade, em
 * vez de depender do atributo `download` numa blob URL do lado do cliente
 * (Firefox não confia nesse atributo pra blob: em vários casos — o
 * gerenciador de download cai pro UUID da própria blob URL como nome. Ver
 * Mozilla Bugzilla #1282407).
 *
 * Uso único (o GET apaga a entrada) + TTL curto — a pegada de memória é
 * limitada por quantas pessoas exportam PDF ao mesmo tempo, não por quanto
 * tempo o processo fica no ar. Isolado por usuário: só quem gerou pode
 * baixar, mesmo com o token.
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

/** Uso único: a entrada some do Map na primeira leitura, exista ela ainda
 * dentro do TTL ou não. */
export function takePdf(
  token: string,
  userId: string,
): { bytes: Uint8Array; filename: string } | undefined {
  const entry = store.get(token);
  store.delete(token);
  if (!entry || entry.userId !== userId || Date.now() > entry.expiresAt) return undefined;
  return { bytes: entry.bytes, filename: entry.filename };
}
