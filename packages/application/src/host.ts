import type { EntrypointDescriptor } from '@loutrejs/core'
import { assertValidCompilation, compileApplication } from '@loutrejs/graph'
import { createHttpExecution } from '@loutrejs/http'
import { ApplicationRuntime, Logger } from '@loutrejs/runtime'
import { createNodeHttpServerDriver } from '@loutrejs/runtime-node'
import type { Server } from 'node:http'
import type {
  ApplicationDefinition,
  HostedApplication,
  HttpListenOptions,
} from './index.js'
import { matchesSchedule } from './scheduler.js'

export interface BootstrapOptions {
  readonly environment?: unknown
}

export function bootstrap<const TDefinition extends ApplicationDefinition>(
  definition: TDefinition,
  options: BootstrapOptions = {},
): HostedApplication<TDefinition> {
  const logger = definition.logger ?? new Logger()
  const entrypoints = registeredEntrypoints(definition)
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
    environmentSource:
      'environment' in options ? options.environment : process.env,
  })
  const hasHttp = graph.executions.some(
    (execution) =>
      execution.kind === 'protocol' && execution.protocol === 'http',
  )
  const http = hasHttp
    ? createHttpExecution({ runtime, graph, logger })
    : undefined
  let server: Server | undefined
  let schedulerTimer: ReturnType<typeof setInterval> | undefined
  let schedulerStarted = false
  let queueListening = false
  const triggeredMinutes = new Map<string, string>()

  const application = {
    graph,
    async init() {
      await runtime.initialize()
      return application
    },
    run(
      entrypoint: EntrypointDescriptor<any, any>,
      ...args: readonly unknown[]
    ) {
      return Reflect.apply(runtime.run, runtime, [entrypoint, ...args])
    },
    async close() {
      if (server) {
        const current = server
        server = undefined
        await closeServer(current)
      }
      if (schedulerTimer) {
        clearInterval(schedulerTimer)
        schedulerTimer = undefined
      }
      schedulerStarted = false
      queueListening = false
      await runtime.shutdown()
    },
    ...(http
      ? {
          async fetch(request: Request) {
            return http.handle(request)
          },
          async listen(listenOptions: HttpListenOptions) {
            if (server) {
              throw new Error(
                'LUTRE_HTTP_ALREADY_LISTENING: HTTP server is already listening.',
              )
            }
            await runtime.initialize()
            const created = createNodeHttpServerDriver(http)
            server = created
            try {
              await listenServer(created, listenOptions)
            } catch (error) {
              server = undefined
              created.close()
              throw error
            }
          },
        }
      : {}),
    ...(definition.schedules.length > 0
      ? {
          scheduler: {
            async start() {
              if (schedulerStarted) {
                throw new Error(
                  'LUTRE_SCHEDULER_ALREADY_STARTED: Scheduler is already started.',
                )
              }
              await runtime.initialize()
              schedulerStarted = true
              const tick = () => {
                const now = new Date()
                const minute = now.toISOString().slice(0, 16)
                for (const schedule of definition.schedules) {
                  if (!matchesSchedule(schedule, now)) continue
                  if (triggeredMinutes.get(schedule.name) === minute) continue
                  triggeredMinutes.set(schedule.name, minute)
                  void runtime
                    .run(
                      schedule.entrypoint as EntrypointDescriptor<void, void>,
                    )
                    .catch((error) => {
                      logger.error('Scheduled Entrypoint execution failed', {
                        event: 'scheduler.execution.failed',
                        schedule: schedule.name,
                        error:
                          error instanceof Error
                            ? error.message
                            : String(error),
                      })
                    })
                }
              }
              tick()
              schedulerTimer = setInterval(tick, 1_000)
            },
            async stop() {
              if (schedulerTimer) clearInterval(schedulerTimer)
              schedulerTimer = undefined
              schedulerStarted = false
            },
          },
        }
      : {}),
    ...(definition.consumers.length > 0
      ? {
          queue: {
            async listen() {
              if (queueListening) {
                throw new Error(
                  'LUTRE_QUEUE_ALREADY_LISTENING: Queue listener is already started.',
                )
              }
              await runtime.initialize()
              queueListening = true
            },
            async stop() {
              queueListening = false
            },
          },
        }
      : {}),
  }

  return application as HostedApplication<TDefinition>
}

function registeredEntrypoints(
  definition: ApplicationDefinition,
): readonly EntrypointDescriptor<any, any>[] {
  return [
    ...new Set([
      ...definition.entrypoints,
      ...definition.schedules.map((schedule) => schedule.entrypoint),
      ...definition.consumers.map((consumer) => consumer.entrypoint),
    ]),
  ]
}

function listenServer(
  server: Server,
  options: HttpListenOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(options.port, options.hostname)
  })
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}
