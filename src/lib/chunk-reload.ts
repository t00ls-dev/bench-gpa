const CHUNK_RELOAD_KEY = "bench-gpa:chunk-reload-attempted";
const IMPORT_ACTIVE_KEY = "bench-gpa:import-active";

interface ReloadMarkerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let pendingChunkReloadError: unknown;
let hasPendingChunkReload = false;
const handledChunkReloadErrors = new WeakSet<object>();
let importActiveInMemory = false;

export function getBrowserSessionStorage(): ReloadMarkerStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function claimChunkReload(storage: ReloadMarkerStorage | null, release: string): boolean {
  if (!storage) return false;
  try {
    if (storage.getItem(CHUNK_RELOAD_KEY) === release) return false;
    storage.setItem(CHUNK_RELOAD_KEY, release);
    return true;
  } catch {
    return false;
  }
}

export function markChunkReloadPending(error: unknown): void {
  pendingChunkReloadError = error;
  hasPendingChunkReload = true;
}

export function isChunkReloadPending(error: unknown): boolean {
  return hasPendingChunkReload && pendingChunkReloadError === error;
}

export function consumeChunkReloadPending(error: unknown): boolean {
  if (isChunkReloadPending(error)) {
    pendingChunkReloadError = undefined;
    hasPendingChunkReload = false;
    return true;
  }
  if (typeof error === "object" && error !== null && handledChunkReloadErrors.has(error)) {
    handledChunkReloadErrors.delete(error);
    return true;
  }
  return false;
}

export function handlePendingChunkReload(error: unknown): boolean {
  if (!isChunkReloadPending(error)) return false;
  pendingChunkReloadError = undefined;
  hasPendingChunkReload = false;
  if (typeof error === "object" && error !== null) handledChunkReloadErrors.add(error);
  return true;
}

export function markImportActive(storage: ReloadMarkerStorage | null): void {
  importActiveInMemory = true;
  if (!storage) return;
  try {
    storage.setItem(IMPORT_ACTIVE_KEY, "1");
  } catch {
    // The in-memory marker still protects this tab when storage is restricted.
  }
}

export function clearImportActive(storage: ReloadMarkerStorage | null): void {
  importActiveInMemory = false;
  if (!storage) return;
  try {
    storage.removeItem(IMPORT_ACTIVE_KEY);
  } catch {
    // Nothing else is required after the in-memory marker is cleared.
  }
}

export function isImportActive(storage: ReloadMarkerStorage | null): boolean {
  if (importActiveInMemory) return true;
  if (!storage) return false;
  try {
    return storage.getItem(IMPORT_ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
    error.message,
  );
}
