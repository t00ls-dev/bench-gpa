// Wraps internal/database errors into a generic, user-safe message.
// Logs the original detail server-side for diagnostics.
export function safeError(
  context: string,
  error: unknown,
  userMessage?: string,
  showRawError?: boolean,
): Error {
  try {
    console.error(`[${context}] error:`, error);
  } catch {
    // ignore logging failure
  }
  if (showRawError) {
    const msg =
      typeof error === "object" && error !== null
        ? String((error as any).message ?? String(error))
        : String(error ?? "");
    return new Error(msg || userMessage || "Ocorreu um erro interno. Tente novamente.", { cause: error });
  }
  return new Error(userMessage ?? "Ocorreu um erro interno. Tente novamente.", { cause: error });
}
