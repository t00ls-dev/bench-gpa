/**
 * Spreadsheet import parameters, shared by the two entry paths: the
 * `/upload` screen and the CLI (`cli:import`).
 *
 * Both used to use 1000 rows per batch, but by coincidence, not by
 * agreement: each with its own literal, in files nobody reads side by
 * side. They could diverge without anything flagging it, and the effect of
 * diverging isn't an error: it's one path importing in a different batch
 * size than the other, with a distinct memory and time profile for the
 * same file.
 */

/**
 * Rows per batch sent to the database.
 *
 * Balances two opposing pressures: too large a batch blows MariaDB's
 * `max_allowed_packet` and holds memory in the process (the VPS has 1.9 GB
 * and one core); too small a batch multiplies round-trips to the database:
 * a daily spreadsheet has ~48k rows, which already comes out to ~48
 * batches at this size.
 */
export const IMPORT_CHUNK_SIZE = 1000;

/** Maximum spreadsheet size accepted by the browser before parsing. */
export const IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Row cap per file, checked on the screen and by every server import stage.
 *
 * This is a sanity barrier, not a technical limit: real daily spreadsheets
 * sit around 48k rows, so anything above this is a sign of the wrong file
 * (an accumulated export, another period's report): better to reject it
 * upfront than to discover it partway through a multi-minute import.
 */
export const IMPORT_MAX_ROWS = 200_000;

// Metadata includes stores and products with zero sales, which do not
// produce staging rows but still belong to the imported spreadsheet.
export const IMPORT_MAX_STORES = 1_000;
export const IMPORT_MAX_PRODUCTS = 50_000;

export const IMPORT_BUSY_MESSAGE =
  "Outra importação está em andamento. Aguarde a conclusão para tentar novamente.";
export const IMPORT_DATE_EXISTS_MESSAGE =
  "A data já foi importada. Revise a seleção e confirme explicitamente a substituição.";
export const IMPORT_LEASE_LOST_MESSAGE =
  "A importação expirou ou perdeu o bloqueio exclusivo. Tente novamente.";
export const IMPORT_ROW_COUNT_MISMATCH_MESSAGE =
  "A quantidade de linhas recebida não confere com o arquivo. Nenhum dado foi publicado.";
export const IMPORT_CANCEL_FAILED_MESSAGE =
  "Não foi possível confirmar o cancelamento. O bloqueio será liberado após 10 minutos sem atividade.";
