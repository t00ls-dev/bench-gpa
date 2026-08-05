import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Implementação real do nonce por requisição, isolada num arquivo que só o
 * server entry (src/server.ts) importa. `node:async_hooks` não existe no
 * navegador: um import estático dele aqui, se este arquivo fosse importado
 * por código compartilhado com o client (como router.tsx, via getCspNonce),
 * já quebra a avaliação do módulo assim que o bundle do client carrega —
 * regressão real, achada em produção em 04/08/2026, poucas horas depois
 * desta mudança ir pro ar (ver histórico de src/lib/csp.ts). Por isso a
 * leitura do nonce (getCspNonce, chamada por router.tsx nos dois lados) mora
 * num arquivo à parte, sem nenhum import do Node, que só enxerga isto via
 * globalThis — nunca precisa importar este módulo.
 *
 * AsyncLocalStorage isola por cadeia de execução assíncrona, não por módulo:
 * cada chamada a runWithCspNonce tem seu próprio valor, mesmo entrelaçada com
 * outras no mesmo processo (requisições concorrentes não vazam nonce uma pra
 * outra).
 */
const nonceStorage = new AsyncLocalStorage<string>();

declare global {
  var __cspNonceStorage: { getStore(): string | undefined } | undefined;
}

globalThis.__cspNonceStorage = nonceStorage;

export function runWithCspNonce<T>(nonce: string, fn: () => T): T {
  return nonceStorage.run(nonce, fn);
}
