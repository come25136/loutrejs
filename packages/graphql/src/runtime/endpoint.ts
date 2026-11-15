import { type ExecutionExtensionRuntimeContext } from '@loutrejs/loutre'
import {
  type CompiledEndpoint,
  type EndpointExtensionRuntime,
} from '../compiled.js'

export function createEndpointRuntime({
  executions,
}: ExecutionExtensionRuntimeContext<CompiledEndpoint>): EndpointExtensionRuntime {
  const endpoints = new Map(
    executions.map((binding) => [
      binding.execution.id,
      binding.execution.compiled.handler.createResolver(binding)(),
    ]),
  )
  return {
    endpoint(id) {
      const endpoint = endpoints.get(id)
      if (!endpoint)
        throw new Error(`GraphQL endpoint runtime is not available: ${id}`)
      return endpoint
    },
    close() {
      endpoints.clear()
    },
  }
}
