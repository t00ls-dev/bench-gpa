// Wraps internal/database errors into a generic, user-safe message.
// Logs the original detail server-side for diagnostics.
export function safeError(context: string, error: unknown, userMessage?: string, showRawError?: boolean): Error {
  try {
    console.error(`[${context}] error:`, error);
  } catch {
    // ignore logging failure
  }
  if (showRawError) {
    const msg = error instanceof Error ? error.message : String(error ?? '');
    return new Error(msg || userMessage || "Ocorreu um erro interno. Tente novamente.");
  }
  return new Error(userMessage ?? "Ocorreu um erro interno. Tente novamente.");
}
