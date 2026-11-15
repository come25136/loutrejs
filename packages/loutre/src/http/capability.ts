import {
  runtimeCapability,
  type RuntimeCapabilityBinding,
} from '../core/index.js'

export interface HttpServerDriver {
  readonly runtime: string
}

export const HTTP_SERVER = runtimeCapability<HttpServerDriver>('http.server')

export function bindHttpServer(
  driver: HttpServerDriver,
): RuntimeCapabilityBinding<HttpServerDriver> {
  return { capability: HTTP_SERVER, value: driver }
}
