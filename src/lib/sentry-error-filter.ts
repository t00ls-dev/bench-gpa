interface SentryEventLike {
  exception?: {
    values?: Array<{
      mechanism?: { type?: string };
    }>;
  };
}

export function isExpectedServerRequestAbort(error: unknown, event: SentryEventLike): boolean {
  if (
    !(error instanceof Error) ||
    error.name !== "AbortError" ||
    error.message !== "This operation was aborted"
  ) {
    return false;
  }

  return (
    event.exception?.values?.some(
      (exception) => exception.mechanism?.type === "auto.middleware.tanstackstart.request",
    ) ?? false
  );
}
