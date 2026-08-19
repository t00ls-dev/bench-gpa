import {
  IMPORT_BUSY_MESSAGE,
  IMPORT_LEASE_LOST_MESSAGE,
  IMPORT_ROW_COUNT_MISMATCH_MESSAGE,
} from "./import-config";

export function mapImportError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("IMPORT_IN_PROGRESS")) return new Error(IMPORT_BUSY_MESSAGE);
  if (message.includes("IMPORT_LEASE_LOST")) return new Error(IMPORT_LEASE_LOST_MESSAGE);
  if (message.includes("IMPORT_ROW_COUNT_MISMATCH")) {
    return new Error(IMPORT_ROW_COUNT_MISMATCH_MESSAGE);
  }
  return error instanceof Error ? error : new Error(message);
}
