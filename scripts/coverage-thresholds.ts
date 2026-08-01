/**
 * Pisos de cobertura — fonte única para o Vitest e para o gerador do resumo.
 *
 * Os dois liam o mesmo objeto escrito duas vezes: uma em `vitest.config.ts`
 * (onde faz o teste falhar) e outra em `generate-coverage-summary.ts` (onde
 * decide o ✅/⚠️ de cada linha do relatório). O próprio script admitia a
 * duplicação num comentário — "Kept in sync with the coverage.thresholds block
 * in vitest.config.ts" —, o que já denunciava que a sincronia dependia de
 * alguém lembrar.
 *
 * O sintoma de esquecer não seria um erro, e sim um relatório mentindo: arquivo
 * marcado como ✅ enquanto o CI reprova por estar abaixo do piso real.
 *
 * São PISOS, não metas: existem para impedir regressão, não para descrever a
 * cobertura desejada. Subir só faz sentido depois que a cobertura real subiu e
 * se manteve — caso contrário o CI quebra em quem mexeu por último, não em quem
 * baixou a cobertura.
 *
 * Recalibrados em 01/08/2026 (auditoria de QA, item 2): `vitest.config.ts`
 * passou a incluir `.tsx` em `test.include`/`coverage.include` — antes,
 * `*.test.tsx` era silenciosamente ignorado (nunca rodava, nem dava erro), e
 * cobertura de componente/página não aparecia nem a 0% no relatório. Isso
 * praticamente dobrou o denominador (117 arquivos fonte contra ~49 antes) com
 * dezenas de componentes ainda sem teste — não é regressão de cobertura real,
 * é o relatório passando a contar honestamente o que sempre existiu. Os pisos
 * antigos (40/40/30/25) mediam só `.ts`; os novos guardam a mesma folga
 * relativa que os antigos tinham contra a cobertura real da época.
 */
export const COVERAGE_THRESHOLDS = {
  lines: 20,
  statements: 20,
  functions: 15,
  branches: 12,
};
