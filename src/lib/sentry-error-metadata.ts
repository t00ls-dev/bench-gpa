const EXPECTED_ERROR = Symbol("expectedError");
const SENTRY_CONTEXT = Symbol("sentryContext");

type SentryContextValue = string | number | boolean | null;

interface SentryErrorMetadata {
  [EXPECTED_ERROR]?: true;
  [SENTRY_CONTEXT]?: {
    name: string;
    values: Record<string, SentryContextValue>;
  };
}

function metadata(error: unknown): SentryErrorMetadata | null {
  return typeof error === "object" && error !== null ? (error as SentryErrorMetadata) : null;
}

export function markExpectedError<T extends Error>(error: T): T {
  Object.defineProperty(error, EXPECTED_ERROR, { value: true });
  return error;
}

export function isExpectedError(error: unknown): boolean {
  return metadata(error)?.[EXPECTED_ERROR] === true;
}

export function attachSentryContext<T extends Error>(
  error: T,
  name: string,
  values: Record<string, SentryContextValue>,
): T {
  Object.defineProperty(error, SENTRY_CONTEXT, { value: { name, values } });
  return error;
}

export function getSentryContext(error: unknown) {
  return metadata(error)?.[SENTRY_CONTEXT] ?? null;
}
