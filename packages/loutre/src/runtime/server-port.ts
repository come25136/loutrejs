export function initialServerPort(requestedPort: number | undefined): number {
  return requestedPort ?? 3000
}

export function canRetryOnNextPort(error: unknown, port: number): boolean {
  return port < 65_535 && isAddressInUseError(error)
}

function isAddressInUseError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'EADDRINUSE'
  )
}
