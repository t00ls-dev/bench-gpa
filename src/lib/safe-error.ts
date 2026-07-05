// Wraps internal/database errors into a generic, user-safe message.
// Logs the original detail server-side for diagnostics.
export function safeError(context: string, error: unknown, userMessage?: string): Error {
  try {
    console.error(`[${context}] error:`, error);
  } catch {
    // ignore logging failure
  }
  return new Error(userMessage ?? "Ocorreu um erro interno. Tente novamente.");
}
