import { IMPORT_CHUNK_SIZE } from "./import-config";

export function parseImportChunkSize(args: string[]): number {
  const index = args.indexOf("--chunk-size");
  if (index === -1) return IMPORT_CHUNK_SIZE;

  const rawValue = args[index + 1];
  if (!rawValue || !/^\d+$/.test(rawValue)) {
    throw new Error(`--chunk-size must be an integer between 1 and ${IMPORT_CHUNK_SIZE}.`);
  }

  const chunkSize = Number(rawValue);
  if (chunkSize < 1 || chunkSize > IMPORT_CHUNK_SIZE) {
    throw new Error(`--chunk-size must be an integer between 1 and ${IMPORT_CHUNK_SIZE}.`);
  }

  return chunkSize;
}
