/**
 * Parâmetros da importação de planilhas, compartilhados pelos dois caminhos de
 * entrada: a tela `/upload` e o CLI (`cli:import`).
 *
 * Os dois usavam 1000 linhas por lote, mas por coincidência, não por acordo:
 * cada um com seu literal, em arquivos que ninguém lê junto. Podiam divergir
 * sem que nada acusasse, e o efeito de divergir não é erro: é um caminho
 * importando em lotes de tamanho diferente do outro, com perfil de memória e de
 * tempo distinto para o mesmo arquivo.
 */

/**
 * Linhas por lote enviado ao banco.
 *
 * Equilibra duas pressões opostas: lote grande demais estoura o
 * `max_allowed_packet` do MariaDB e segura memória no processo (a VPS tem 1,9 GB
 * e um núcleo); lote pequeno demais multiplica idas ao banco: uma planilha
 * diária tem ~48k linhas, o que já dá ~48 lotes neste tamanho.
 */
export const IMPORT_CHUNK_SIZE = 1000;

/**
 * Teto de linhas por arquivo, verificado na tela antes de começar.
 *
 * É uma barreira de sanidade, não um limite técnico: as planilhas diárias reais
 * ficam em torno de 48k linhas, então algo acima disto é sinal de arquivo
 * errado (um export acumulado, o relatório de outro período): melhor recusar
 * na hora do que descobrir no meio de uma importação de vários minutos.
 */
export const IMPORT_MAX_ROWS = 200_000;
