/**
 * Sem NENHUM import do Node aqui de propósito: este arquivo é importado por
 * router.tsx, que roda tanto no server quanto no bundle do client. A
 * implementação real (AsyncLocalStorage) mora em src/lib/csp-server.ts, que
 * só o server entry (src/server.ts) importa — o registro em `globalThis`
 * (feito por csp-server.ts ao ser importado) é a única ponte entre os dois.
 *
 * Regressão real que motivou essa separação (04/08/2026, poucas horas depois
 * da versão anterior ir pro ar): `node:async_hooks` não existe no navegador;
 * um `import { AsyncLocalStorage } from "node:async_hooks"` estático neste
 * arquivo, mesmo sem nunca ser chamado no client, já quebrava a avaliação do
 * módulo assim que o bundle do client carregava (o Vite externaliza o
 * import, e acessar o nome exportado do stub already lança) — derrubava a
 * hidratação da aplicação inteira, não só o CSP.
 *
 * No client, `globalThis.__cspNonceStorage` nunca é definido (csp-server.ts
 * nunca é importado lá), então getCspNonce() sempre devolve undefined —
 * correto, já que o client não precisa saber o nonce da resposta SSR.
 */
export function getCspNonce(): string | undefined {
  return globalThis.__cspNonceStorage?.getStore();
}
