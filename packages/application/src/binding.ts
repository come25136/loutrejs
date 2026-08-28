import type { TaskDescriptor } from '@loutrejs/core'
import { assertValidCompilation, compileApplication } from '@loutrejs/graph'
import { createHttpExecution, type HttpProtocolExecution } from '@loutrejs/http'
import { ApplicationRuntime, Logger } from '@loutrejs/runtime'
import type {
  ApplicationDefinition,
  BootstrapArguments,
  InvocationApplication,
} from './index.js'

export interface InvocationBinding<TDefinition extends ApplicationDefinition> {
  readonly application: InvocationApplication<TDefinition>
  readonly http?: HttpProtocolExecution
}

export interface InvocationBindingBaseOptions<
  TDefinition extends ApplicationDefinition,
> {
  readonly application: TDefinition
  readonly environment?: unknown
}

export type InvocationBindingOptions<
  TDefinition extends ApplicationDefinition,
> = InvocationBindingBaseOptions<TDefinition> & BootstrapArguments<TDefinition>

/** @internal build/deployment toolingがcallback runtime bindingを生成する。 */
export function createInvocationBinding<
  const TDefinition extends ApplicationDefinition,
>(
  options: InvocationBindingOptions<TDefinition>,
): InvocationBinding<TDefinition> {
  const definition = options.application
  const logger = definition.logger ?? new Logger()
  const tasks = registeredTasks(definition)
  const graph = assertValidCompilation(
    compileApplication({
      modules: definition.modules,
      ...(definition.arguments === undefined
        ? {}
        : { arguments: definition.arguments }),
      tasks: definition.tasks,
      triggers: definition.triggers,
    }),
  )
  const runtime = new ApplicationRuntime(definition.modules, {
    logger,
    tasks,
    publicTasks: definition.tasks,
    ...(definition.arguments === undefined
      ? {}
      : {
          arguments: definition.arguments,
          argumentsSource:
            'arguments' in options ? options.arguments : Object.freeze({}),
        }),
    ...('environment' in options
      ? { environmentSource: options.environment }
      : {}),
  })
  const application = {
    graph,
    async init() {
      await runtime.initialize()
      return application
    },
    ...(definition.tasks.length > 0
      ? {
          run(task: TaskDescriptor, ...args: readonly unknown[]) {
            return Reflect.apply(runtime.run, runtime, [task, ...args])
          },
        }
      : {}),
    close: (signal?: string) => runtime.shutdown(signal),
  } as InvocationApplication<TDefinition>
  const hasHttp = graph.hostCapabilities.includes('http')
  return {
    application,
    ...(hasHttp
      ? { http: createHttpExecution({ runtime, graph, logger }) }
      : {}),
  }
}

function registeredTasks(
  definition: ApplicationDefinition,
): readonly TaskDescriptor<any, any>[] {
  return [
    ...new Set([
      ...definition.tasks,
      ...definition.triggers.map((trigger) => trigger.task),
    ]),
  ]
}
