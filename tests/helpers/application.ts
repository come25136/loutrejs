import {
  defineApplication,
  type HttpApplicationCapability,
} from '@loutrejs/loutre'
import { bootstrap } from '@loutrejs/loutre/host'
import type { ModuleInstance } from '@loutrejs/loutre'
import {
  assertValidCompilation,
  compileApplication,
} from '@loutrejs/loutre/graph'
import type { HttpProtocolExecution } from '@loutrejs/loutre/http'
import { createMessagePortExecution } from '@loutrejs/loutre/message-port'
import { ApplicationRuntime, type Logger } from '@loutrejs/loutre/runtime'

export function createTestApplication<
  const TModules extends readonly ModuleInstance[],
>(options: { readonly modules: TModules; readonly logger?: Logger }) {
  const definition = defineApplication(options)
  return bootstrap({ application: definition }) as ReturnType<
    typeof bootstrap
  > &
    HttpApplicationCapability
}

export function httpExecutionOf(
  application: ReturnType<typeof bootstrap> & HttpApplicationCapability,
): HttpProtocolExecution {
  return {
    graph: application.graph,
    initialize: async () => {
      await application.init()
    },
    shutdown: async () => application.close(),
    onServerListening: () => undefined,
    handle: (request) => application.fetch(request),
  }
}

export function createTestMessagePortExecution(
  modules: readonly ModuleInstance[],
  logger?: Logger,
) {
  const graph = assertValidCompilation(compileApplication({ modules }))
  const runtime = new ApplicationRuntime(
    modules,
    logger === undefined ? {} : { logger },
  )
  return createMessagePortExecution({
    runtime,
    graph,
    ...(logger === undefined ? {} : { logger }),
  })
}
