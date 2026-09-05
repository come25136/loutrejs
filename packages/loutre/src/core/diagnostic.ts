export interface Diagnostic {
  readonly code: string
  readonly message: string
  readonly path: string
  readonly severity?: 'error' | 'warning'
}

export function diagnostic(
  code: string,
  message: string,
  path: string,
  severity: Diagnostic['severity'] = 'error',
): Diagnostic {
  return Object.freeze({ code, message, path, severity })
}
