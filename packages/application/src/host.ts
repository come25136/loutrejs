import {
  queueRuntimeToken,
  validateSchema,
  type CronTriggerDescriptor,
  type EntrypointDescriptor,
  type FixedDelayTriggerDescriptor,
  type QueueConsumerTriggerDescriptor,
  type TriggerDescriptor,
} from '@loutrejs/core'
import { assertValidCompilation, compileApplication } from '@loutrejs/graph'
import { createHttpExecution } from '@loutrejs/http'
import { ApplicationRuntime, Logger } from '@loutrejs/runtime'
import { createNodeHttpServerDriver } from '@loutrejs/runtime-node'
import type { Server } from 'node:http'
import type {
  ApplicationDefinition,
  HostedApplication,
  HttpListenOptions,
  QueueConsumerDriver,
  QueueConsumerHandle,
} from './index.js'
import { matchesCronTrigger } from './scheduler.js'

export interface BootstrapOptions {
  readonly environment?: unknown
}

type TriggerHandle = { stop(): Promise<void> }

export function bootstrap<const TDefinition extends ApplicationDefinition>(
  definition: TDefinition,
  options: BootstrapOptions = {},
): HostedApplication<TDefinition> {
  const logger = definition.logger ?? new Logger()
  const entrypoints = registeredEntrypoints(definition)
  const graph = assertValidCompilation(
    compileApplication({
      modules: definition.modules,
      entrypoint: definition.entrypoint,
      triggers: definition.triggers,
    }),
  )
  const runtime = new ApplicationRuntime(definition.modules, {
    logger,
    entrypoints,
    environmentSource:
      'environment' in options ? options.environment : process.env,
  })
  const hasHttp = graph.hostCapabilities.includes('http')
  const http = hasHttp
    ? createHttpExecution({ runtime, graph, logger })
    : undefined
  let server: Server | undefined
  let triggersStarted = false
  let triggerHandles: TriggerHandle[] = []

  const stopTriggers = async () => {
    const handles = triggerHandles
    triggerHandles = []
    triggersStarted = false
    const results = await Promise.allSettled(
      handles.toReversed().map((handle) => handle.stop()),
    )
    const errors = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    )
    if (errors.length > 0)
      throw new AggregateError(errors, 'Trigger stop failed')
  }

  const application = {
    graph,
    async init() {
      await runtime.initialize()
      return application
    },
    ...(definition.entrypoint
      ? {
          run(...args: readonly unknown[]) {
            return Reflect.apply(runtime.run, runtime, [
              definition.entrypoint,
              ...args,
            ])
          },
        }
      : {}),
    async close(signal?: string) {
      runtime.stopAcceptingExecutions()
      const errors: unknown[] = []
      if (server) {
        const current = server
        server = undefined
        try {
          await closeServer(current)
        } catch (error) {
          errors.push(error)
        }
      }
      try {
        await stopTriggers()
      } catch (error) {
        errors.push(error)
      }
      try {
        await runtime.shutdown(signal)
      } catch (error) {
        errors.push(error)
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, 'Application shutdown failed')
      }
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
    ...(definition.triggers.length > 0
      ? {
          triggers: {
            async start() {
              if (triggersStarted) {
                throw new Error(
                  'LUTRE_TRIGGERS_ALREADY_STARTED: Trigger Engine is already started.',
                )
              }
              await runtime.initialize()
              triggersStarted = true
              const started: TriggerHandle[] = []
              try {
                for (const trigger of definition.triggers) {
                  started.push(await startTrigger(trigger, runtime, logger))
                }
                triggerHandles = started
              } catch (error) {
                await Promise.allSettled(
                  started.toReversed().map((handle) => handle.stop()),
                )
                triggersStarted = false
                throw error
              }
            },
            stop: stopTriggers,
          },
        }
      : {}),
  }

  return application as HostedApplication<TDefinition>
}

async function startTrigger(
  trigger: TriggerDescriptor,
  runtime: ApplicationRuntime,
  logger: Logger,
): Promise<TriggerHandle> {
  switch (trigger.trigger) {
    case 'cron':
      return startCronTrigger(trigger, runtime, logger)
    case 'fixed-delay':
      return startFixedDelayTrigger(trigger, runtime, logger)
    case 'queue-consumer':
      return startQueueTrigger(trigger, runtime)
  }
}

function startCronTrigger(
  trigger: CronTriggerDescriptor<any>,
  runtime: ApplicationRuntime,
  logger: Logger,
): TriggerHandle {
  let stopped = false
  let lastMinute: string | undefined
  const active = new Set<Promise<void>>()
  const tick = () => {
    if (stopped) return
    const now = new Date()
    if (!matchesCronTrigger(trigger, now)) return
    const minute = cronMinuteIdentity(trigger.timezone, now)
    if (lastMinute === minute) return
    lastMinute = minute
    if (trigger.overlap === 'skip' && active.size > 0) {
      logger.info('Cron trigger skipped overlapping execution', {
        event: 'trigger.cron.skipped',
        trigger: trigger.name,
      })
      return
    }
    const execution = runtime
      .run(trigger.entrypoint as EntrypointDescriptor<void, void>)
      .catch((error) => {
        logger.error('Cron trigger execution failed', {
          event: 'trigger.cron.execution.failed',
          trigger: trigger.name,
          error: error instanceof Error ? error.message : String(error),
        })
      })
    active.add(execution)
    void execution.finally(() => active.delete(execution))
  }
  tick()
  const timer = setInterval(tick, 1_000)
  return {
    async stop() {
      if (stopped) return
      stopped = true
      clearInterval(timer)
      await Promise.allSettled(active)
    },
  }
}

function startFixedDelayTrigger(
  trigger: FixedDelayTriggerDescriptor<any>,
  runtime: ApplicationRuntime,
  logger: Logger,
): TriggerHandle {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let releaseSleep: (() => void) | undefined
  const sleep = () =>
    new Promise<void>((resolve) => {
      releaseSleep = resolve
      timer = setTimeout(() => {
        timer = undefined
        releaseSleep = undefined
        resolve()
      }, trigger.delay)
    })
  const execute = async () => {
    try {
      await runtime.run(trigger.entrypoint as EntrypointDescriptor<void, void>)
    } catch (error) {
      logger.error('Fixed-delay trigger execution failed', {
        event: 'trigger.fixed_delay.execution.failed',
        trigger: trigger.name,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  const loop = (async () => {
    if (!trigger.immediate) await sleep()
    while (true) {
      if (stopped) break
      await execute()
      if (stopped) break
      await sleep()
    }
  })()
  return {
    async stop() {
      if (stopped) return
      stopped = true
      if (timer) clearTimeout(timer)
      timer = undefined
      releaseSleep?.()
      releaseSleep = undefined
      await loop
    },
  }
}

async function startQueueTrigger(
  trigger: QueueConsumerTriggerDescriptor<any, any>,
  runtime: ApplicationRuntime,
): Promise<QueueConsumerHandle> {
  const driver = runtime.container.resolve(
    queueRuntimeToken(trigger.queue),
  ) as QueueConsumerDriver
  if (!driver || typeof driver.start !== 'function') {
    throw new Error(
      `LUTRE_QUEUE_DRIVER_INVALID: Queue ${trigger.queue.name} driver is invalid.`,
    )
  }
  const handle = await driver.start({
    consume: async (payload) => {
      const validated = await validateSchema(trigger.queue.payload, payload)
      await runtime.run(trigger.entrypoint, validated)
    },
  })
  if (!handle || typeof handle.stop !== 'function') {
    throw new Error(
      `LUTRE_QUEUE_DRIVER_INVALID: Queue ${trigger.queue.name} driver returned an invalid handle.`,
    )
  }
  return handle
}

function registeredEntrypoints(
  definition: ApplicationDefinition,
): readonly EntrypointDescriptor<any, any>[] {
  return [
    ...new Set([
      ...(definition.entrypoint ? [definition.entrypoint] : []),
      ...definition.triggers.map((trigger) => trigger.entrypoint),
    ]),
  ]
}

function cronMinuteIdentity(timezone: string, instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant)
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
