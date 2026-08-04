import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Uma variável de módulo comum aqui já foi um bug real (achado em 04/08/2026,
 * na investigação do PM2 cluster mode, mas existente mesmo em fork/1
 * instância): o nonce é setado antes de renderizar (src/server.ts) e lido bem
 * fundo, dentro do SSR (router.tsx). Como o event loop do Node intercala
 * requisições concorrentes em qualquer gap de await, uma segunda requisição
 * podia sobrescrever o nonce da primeira antes dela terminar de renderizar: o
 * header CSP da resposta saía certo (é local, closure), mas o HTML podia
 * embutir o nonce de outra requisição nas tags de script, e o navegador
 * bloqueava por violação de CSP.
 *
 * AsyncLocalStorage isola por cadeia de execução assíncrona, não por módulo:
 * cada chamada a runWithCspNonce tem seu próprio valor, mesmo entrelaçada com
 * outras no mesmo processo. Não precisa mais de reset manual (o antigo
 * setCspNonce(undefined) em server.ts) pra evitar vazar pra próxima
 * requisição: fora do run(), simplesmente não tem valor nenhum.
 */
const nonceStorage = new AsyncLocalStorage<string>();

export function runWithCspNonce<T>(nonce: string, fn: () => T): T {
  return nonceStorage.run(nonce, fn);
}

export function getCspNonce(): string | undefined {
  return nonceStorage.getStore();
}
