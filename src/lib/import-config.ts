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

/**
 * Row cap per file, checked on the screen before starting.
 *
 * This is a sanity barrier, not a technical limit: real daily spreadsheets
 * sit around 48k rows, so anything above this is a sign of the wrong file
 * (an accumulated export, another period's report): better to reject it
 * upfront than to discover it partway through a multi-minute import.
 */
export const IMPORT_MAX_ROWS = 200_000;
