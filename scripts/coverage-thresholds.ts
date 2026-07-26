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
 */
export const COVERAGE_THRESHOLDS = {
  lines: 40,
  statements: 40,
  functions: 30,
  branches: 25,
};
