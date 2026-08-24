export interface NormalizedApplicationError {
  readonly code: 'INTERNAL_ERROR'
  readonly errorId: string
  readonly message: string
  readonly stack?: string
  readonly cause?: unknown
  readonly context: Readonly<Record<string, unknown>>
  readonly original: unknown
}

export function normalizeUnknownError(
  error: unknown,
  context: Readonly<Record<string, unknown>> = {},
): NormalizedApplicationError {
  return {
    code: 'INTERNAL_ERROR',
    errorId: crypto.randomUUID(),
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof Error && error.stack !== undefined
      ? { stack: error.stack }
      : {}),
    ...(error instanceof Error && error.cause !== undefined
      ? { cause: error.cause }
      : {}),
    context,
    original: error,
  }
}
