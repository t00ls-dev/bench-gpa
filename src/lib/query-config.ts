/**
 * staleTime/gcTime nomeados para as queries do React Query no cliente.
 *
 * Eixo separado do cache do servidor (CACHE_TTL_SHORT/LONG em cache.ts):
 * staleTime decide se o BROWSER sequer pergunta de novo; o TTL do servidor
 * decide, quando pergunta, se a resposta vem do cache ou bate no banco. Os
 * valores aqui são deliberadamente mais longos que o TTL do servidor
 * correspondente (ex.: filter-bar pede 10min de staleTime contra 5min de
 * CACHE_TTL_LONG no servidor): não há necessidade de o cliente perguntar de
 * novo só porque o servidor já teria uma resposta fresca.
 *
 * Agrupados pelo que invalida o dado, não por "quanto tempo parece razoável".
 * O default do QueryClient (router.tsx: staleTime 60s, gcTime 10min) já cobre
 * o caso comum: as constantes abaixo só existem para quem precisa de outro
 * valor, com o motivo ao lado.
 */

/** Audit log do admin: o mais "ao vivo" da aplicação. */
export const QUERY_STALE_LIVE = 15_000;

/** Painéis operacionais do admin (diagnóstico, saúde do banco, heartbeats). */
export const QUERY_STALE_ADMIN = 30_000;

/**
 * Identidade da sessão e indicadores leves da UI (última venda no rodapé).
 * Coincide com o default do QueryClient (60s), mantido explícito porque a
 * razão de ser 60s aqui é independente do default global: é o prazo de "não
 * bater no servidor a cada navegação" descrito em _authenticated/route.tsx:
 * mudar o default global não deveria mudar isto por acidente.
 */
export const QUERY_STALE_IDENTITY = 60_000;

/** Dado que muda a cada import: métricas, listagens, análises. */
export const QUERY_STALE_CORE = 5 * 60_000;

/** Dado de referência/hierarquia: só muda quando a hierarquia muda. */
export const QUERY_STALE_REFERENCE = 10 * 60_000;

/**
 * gcTime da faixa "referência": mantém a hierarquia/opções em memória mais
 * tempo que o default do QueryClient (10min), já que raramente ficam obsoletas.
 */
export const QUERY_GC_REFERENCE = 30 * 60_000;
