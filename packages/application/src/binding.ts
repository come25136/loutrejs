import type { EntrypointDescriptor } from '@loutrejs/core'
import { assertValidCompilation, compileApplication } from '@loutrejs/graph'
import {
  createHttpExecution,
  type HttpProtocolExecution,
} from '@loutrejs/http'
import { ApplicationRuntime, Logger } from '@loutrejs/runtime'
import type {
  ApplicationDefinition,
  InvocationApplication,
} from './index.js'

export interface InvocationBinding<
  TDefinition extends ApplicationDefinition,
> {
  readonly application: InvocationApplication<TDefinition>
  readonly http?: HttpProtocolExecution
}

/** @internal build/deployment toolingがcallback runtime bindingを生成する。 */
export function createInvocationBinding<
  const TDefinition extends ApplicationDefinition,
>(
  definition: TDefinition,
  environment?: unknown,
): InvocationBinding<TDefinition> {
  const logger = definition.logger ?? new Logger()
  const entrypoints = [
    ...new Set([
      ...definition.entrypoints,
      ...definition.schedules.map((schedule) => schedule.entrypoint),
      ...definition.consumers.map((consumer) => consumer.entrypoint),
    ]),
  ]
  const graph = assertValidCompilation(
    compileApplication({
      modules: definition.modules,
      entrypoints: definition.entrypoints,
      schedules: definition.schedules,
      queues: definition.queues,
      consumers: definition.consumers,
    }),
  )
  const runtime = new ApplicationRuntime(definition.modules, {
    logger,
    entrypoints,
    ...(environment === undefined ? {} : { environmentSource: environment }),
  })
  const application = {
    graph,
    async init() {
      await runtime.initialize()
      return application
    },
    run(entrypoint: EntrypointDescriptor<any, any>, ...args: readonly unknown[]) {
      return Reflect.apply(runtime.run, runtime, [entrypoint, ...args])
    },
    close: () => runtime.shutdown(),
  } as InvocationApplication<TDefinition>
  const hasHttp = graph.executions.some(
    (execution) =>
      execution.kind === 'protocol' && execution.protocol === 'http',
  )
  return {
    application,
    ...(hasHttp
      ? { http: createHttpExecution({ runtime, graph, logger }) }
      : {}),
  }
}
