---
name: performance-review
description: Checklist de performance do Bench GPA (cache, bundle, queries, build). Use ao investigar lentidão relatada, antes de adicionar uma dependência client-side pesada, ou ao revisar uma query nova em server function.
---

# Revisão de performance

## Objetivo

Pegar regressões de performance antes de irem para produção — bundle
maior, query sem índice, cache que devia existir e não existe.

## Quando usar

- Relato de lentidão em uma tela ou server function específica
- Antes de adicionar uma dependência client-side nova
- Ao escrever uma query nova ou alterar uma existente

## O que checar

### Server functions e banco

- Server function acima de ~500ms merece investigação — comece pelo
  `EXPLAIN` da query no MariaDB antes de otimizar em código.
- N+1 query: um loop fazendo uma query por item é sempre suspeito — junte
  numa query só com `IN (...)` ou `JOIN`.
- Índices ausentes: ver skill `database-review` para o processo de
  decisão (remover um índice não usado também é uma otimização válida —
  já aconteceu neste projeto, ver `docs/medicao-performance.md`).

### Cache

- `SimpleCache` (`src/lib/cache.ts`) já cobre dashboard/rankings (60s),
  hierarquia de área e opções de filtro (5min), datas importadas (60s),
  role (5min/user) — inclui dedup de chamadas in-flight. Dado estático ou
  que não muda a cada request é candidato a entrar aqui antes de qualquer
  otimização mais complexa.

### Bundle e frontend

- Chunk acima de 200 KB gzip merece investigação — checar se dá pra
  lazy-load (toda rota já divide `.tsx`/`.page.tsx` justamente para isso).
- Re-render desnecessário: componente pesado sem `memo`, dependência de
  hook mal calculada.
- Requisição repetida para o mesmo dado dentro da mesma navegação — sinal
  de que falta cache ou dedup (ver acima).

### Build

- Build acima de 30s merece investigação. Vite 8 (migrado de Vite 7,
  ver `docs/medicao-performance.md`) trouxe o build de SSR de ~25-35s para
  ~2s — se o tempo voltar a subir, comparar contra esse baseline antes de
  assumir que é normal.

### Medição

- Toda medição de performance relevante vai para
  `docs/medicao-performance.md` (append, nunca só no chat) — inclui
  metodologia e número, não só a conclusão.

## Checklist

- [ ] Query nova tem `EXPLAIN` checado se toca tabela grande
      (`sales_daily_agg`, `sales_prod_daily_agg`)
- [ ] Dado estático/repetido passa por `SimpleCache` antes de bater no
      banco a cada request
- [ ] Dependência client-side nova não estourou o limite de chunk
- [ ] Medição relevante foi registrada em `docs/medicao-performance.md`
