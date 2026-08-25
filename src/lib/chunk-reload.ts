const CHUNK_RELOAD_KEY = "bench-gpa:chunk-reload-attempted";

interface ReloadMarkerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function claimChunkReload(storage: ReloadMarkerStorage, release: string): boolean {
  if (storage.getItem(CHUNK_RELOAD_KEY) === release) return false;

  storage.setItem(CHUNK_RELOAD_KEY, release);
  return true;
}
