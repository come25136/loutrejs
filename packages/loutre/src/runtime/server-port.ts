import type { Brand } from '../internal/brand.js'

export type RequestedPort = Brand<number, 'port.requested'>
export type BoundPort = Brand<number, 'port.bound'>
export const boundPort = (value: number): BoundPort => value as BoundPort

export function initialServerPort(
  requestedPort: number | undefined,
): RequestedPort {
  return (requestedPort ?? 3000) as RequestedPort
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
