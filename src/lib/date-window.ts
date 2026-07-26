/**
 * Janela de datas que as telas abrem por padrão.
 *
 * O `7` estava escrito em dois lugares (`filter-bar.tsx` e `area.page.tsx`), e
 * junto com ele a lógica de recortar as últimas N datas disponíveis — quase
 * igual nos dois, com uma diferença sutil que só se percebia comparando os
 * arquivos lado a lado. Aqui vira uma função só, no modelo de `retention.ts`:
 * a constante e a decisão que depende dela moram juntas.
 *
 * O valor não é estético. Agregar a tabela de detalhe inteira (~3M linhas) a
 * cada carga do dashboard levava ~20s; a janela de 7 dias mantém abaixo de 1s.
 * O seletor de período continua permitindo qualquer intervalo — isto é só o
 * ponto de partida.
 *
 * NÃO confundir com o `7` de `shiftPeriod` (api-types.ts), que é "dias numa
 * semana" para o período de comparação. Mesmo número, conceito diferente:
 * mudar a janela padrão não deve mexer na comparação semanal.
 */
export const DEFAULT_WINDOW_DAYS = 7;

/**
 * Últimas `DEFAULT_WINDOW_DAYS` datas com dado, dentre as disponíveis.
 *
 * `available` precisa estar em ordem crescente — é a garantia que
 * `getFilterOptions`/`getAreaFilterHierarchy` firmam ao ordenar na borda (há um
 * comentário longo lá explicando por quê: uma proc antiga em produção devolvia
 * DESC e produzia um intervalo invertido que não carregava dado nenhum).
 *
 * `latest` limita o fim da janela à última data importada — a tela Área usa
 * isso; o dashboard não passa e pega tudo o que existe. Devolve `null` quando
 * não há data alguma, para o chamador decidir o que fazer.
 */
export function defaultDateWindow(
  available: readonly string[],
  latest?: string | null,
): { from: string; to: string } | null {
  const upTo = latest ? available.filter((d) => d <= latest) : available;

  if (upTo.length === 0) {
    // Sem nenhuma data até o limite: o único recorte possível é o próprio
    // limite, se houver. É o caso de borda que a tela Área já tratava.
    return latest ? { from: latest, to: latest } : null;
  }

  const win = upTo.slice(-DEFAULT_WINDOW_DAYS);
  return { from: win[0], to: latest ?? upTo[upTo.length - 1] };
}
