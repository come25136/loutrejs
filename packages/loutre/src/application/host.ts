import type { HttpProtocolExecution } from '../http/index.js'
import { binding } from './binding.js'
import type {
  ApplicationDefinition,
  BootstrapArguments,
  HostedApplication,
} from './index.js'

export interface BootstrapBaseOptions<
  TDefinition extends ApplicationDefinition,
> {
  readonly application: TDefinition
  readonly environment?: unknown
}

export type BootstrapOptions<TDefinition extends ApplicationDefinition> =
  BootstrapBaseOptions<TDefinition> & BootstrapArguments<TDefinition>

/**
 * Runtime-neutralなApplication host primitive。
 * listener/module export/transport ownershipはruntime adapterが担う。
 */
export function bootstrap<const TDefinition extends ApplicationDefinition>(
  options: BootstrapOptions<TDefinition>,
): HostedApplication<TDefinition> {
  const host = binding.host(options)
  const http = 'http' in host ? (host.http as HttpProtocolExecution) : undefined
  if (http) {
    Object.assign(host.application, {
      fetch(request: Request) {
        return http.handle(request)
      },
    })
  }
  return host.application as HostedApplication<TDefinition>
}
