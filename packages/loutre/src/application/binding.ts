import {
  queueRuntimeToken,
  validateSchema,
  type CronTriggerDescriptor,
  type FixedDelayTriggerDescriptor,
  type ProviderDescriptor,
  type QueueConsumerTriggerDescriptor,
  type QueueDescriptor,
  type TaskDescriptor,
  type TriggerDescriptor,
} from '../core/index.js'
import { assertValidCompilation, compileApplication } from '../graph/index.js'
import {
  createHttpExecution,
  type HttpProtocolExecution,
} from '../http/index.js'
import {
  createMessagePortExecution,
  type MessagePortProtocolExecution,
} from '../message-port/index.js'
import { ApplicationRuntime, Logger } from '../runtime/index.js'
import type {
  ApplicationDefinition,
  BootstrapArguments,
  HasHttp,
  HasMessagePort,
  HasTriggers,
  InvocationApplication,
  QueueConsumerDriver,
  QueueConsumerHandle,
  TriggerApplicationCapability,
} from './index.js'
import { bindQueueDriver } from './queue.js'
import { matchesCronTrigger } from './scheduler.js'

type IsAny<TValue> = 0 extends 1 & TValue ? true : false

type ProtocolBinding<TDefinition extends ApplicationDefinition> =
  IsAny<TDefinition> extends true
    ? {
        readonly http?: HttpProtocolExecution
        readonly messagePort?: MessagePortProtocolExecution
      }
    : (HasHttp<TDefinition> extends true
        ? { readonly http: HttpProtocolExecution }
        : {}) &
        (HasMessagePort<TDefinition> extends true
          ? { readonly messagePort: MessagePortProtocolExecution }
          : {})

export type InvocationBinding<TDefinition extends ApplicationDefinition> = {
  readonly application: InvocationApplication<TDefinition>
} & ProtocolBinding<TDefinition>

export type HostBindingApplication<TDefinition extends ApplicationDefinition> =
  InvocationApplication<TDefinition> &
    (HasTriggers<TDefinition> extends true ? TriggerApplicationCapability : {})

export type HostBinding<TDefinition extends ApplicationDefinition> = {
  readonly application: HostBindingApplication<TDefinition>
} & ProtocolBinding<TDefinition>

export interface InvocationBindingBaseOptions<
  TDefinition extends ApplicationDefinition,
> {
  readonly application: TDefinition
  readonly environment?: unknown
}

export type InvocationBindingOptions<
  TDefinition extends ApplicationDefinition,
> = InvocationBindingBaseOptions<TDefinition> & BootstrapArguments<TDefinition>

interface BindingApi {
  invocation<const TDefinition extends ApplicationDefinition>(
    options: InvocationBindingOptions<TDefinition>,
  ): InvocationBinding<TDefinition>
  host<const TDefinition extends ApplicationDefinition>(
    options: InvocationBindingOptions<TDefinition>,
  ): HostBinding<TDefinition>
  queue(
    descriptor: QueueDescriptor,
    driver: QueueConsumerDriver,
  ): ProviderDescriptor
}

/** flatなcreateXXX/bindXXX APIを増殖させないため、外部bindingをnamespaceへ集約する。 */
export const binding: Readonly<BindingApi> = Object.freeze({
  invocation: createInvocationBinding,
  host: createHostBinding,
  queue: bindQueueDriver,
})

function createInvocationBinding<
  const TDefinition extends ApplicationDefinition,
>(
  options: InvocationBindingOptions<TDefinition>,
): InvocationBinding<TDefinition> {
  const state = createRuntimeState(options)
  const application = createInvocationApplication(state)
  return createProtocolBinding(
    state,
    application,
  ) as InvocationBinding<TDefinition>
}

function createHostBinding<const TDefinition extends ApplicationDefinition>(
  options: InvocationBindingOptions<TDefinition>,
): HostBinding<TDefinition> {
  const state = createRuntimeState(options)
  const application = createInvocationApplication(state)
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

  Object.assign(application, {
    async close(signal?: string) {
      state.runtime.stopAcceptingExecutions()
      const errors: unknown[] = []
      try {
        await stopTriggers()
      } catch (error) {
        errors.push(error)
      }
      try {
        await state.runtime.shutdown(signal)
      } catch (error) {
        errors.push(error)
      }
      if (errors.length > 0)
        throw new AggregateError(errors, 'Application shutdown failed')
    },
    ...(state.definition.triggers.length > 0
      ? {
          triggers: {
            async start() {
              if (triggersStarted) {
                throw new Error(
                  'LUTRE_TRIGGERS_ALREADY_STARTED: Trigger Engine is already started.',
                )
              }
              await state.runtime.initialize()
              triggersStarted = true
              const started: TriggerHandle[] = []
              try {
                for (const trigger of state.definition.triggers) {
                  started.push(
                    await startTrigger(trigger, state.runtime, state.logger),
                  )
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
  })

  return createProtocolBinding(state, application) as HostBinding<TDefinition>
}

interface RuntimeState<TDefinition extends ApplicationDefinition> {
  readonly definition: TDefinition
  readonly logger: Logger
  readonly runtime: ApplicationRuntime
  readonly graph: ReturnType<typeof assertValidCompilation>
}

function createRuntimeState<const TDefinition extends ApplicationDefinition>(
  options: InvocationBindingOptions<TDefinition>,
): RuntimeState<TDefinition> {
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
  return { definition, logger, runtime, graph }
}

function createInvocationApplication<TDefinition extends ApplicationDefinition>(
  state: RuntimeState<TDefinition>,
): InvocationApplication<TDefinition> {
  const application = {
    graph: state.graph,
    get(token: Parameters<ApplicationRuntime['get']>[0]) {
      return state.runtime.get(token)
    },
    async init() {
      await state.runtime.initialize()
      return application
    },
    ...(state.definition.tasks.length > 0
      ? {
          run(task: TaskDescriptor, ...args: readonly unknown[]) {
            return Reflect.apply(state.runtime.run, state.runtime, [
              task,
              ...args,
            ])
          },
        }
      : {}),
    close: (signal?: string) => state.runtime.shutdown(signal),
    [Symbol.asyncDispose]() {
      return this.close()
    },
  }
  return application as InvocationApplication<TDefinition>
}

function createProtocolBinding<TDefinition extends ApplicationDefinition>(
  state: RuntimeState<TDefinition>,
  application: object,
): object {
  const protocols = new Set(
    state.graph.pipelines.map(
      (pipeline: { readonly protocol: string }) => pipeline.protocol,
    ),
  )
  return {
    application,
    ...(protocols.has('http')
      ? {
          http: createHttpExecution({
            runtime: state.runtime,
            graph: state.graph,
            logger: state.logger,
          }),
        }
      : {}),
    ...(protocols.has('messagePort')
      ? {
          messagePort: createMessagePortExecution({
            runtime: state.runtime,
            graph: state.graph,
            logger: state.logger,
          }),
        }
      : {}),
  }
}

type TriggerHandle = { stop(): Promise<void> }

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
  throw new Error('LUTRE_TRIGGER_UNSUPPORTED: Unsupported trigger type.')
}

function startCronTrigger(
  trigger: CronTriggerDescriptor,
  runtime: ApplicationRuntime,
  logger: Logger,
): TriggerHandle {
  let stopped = false
  let lastMinute: string | undefined
  const active = new Set<Promise<unknown>>()
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
    const execution = runtime.runTask(trigger.task).catch((error) => {
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
  trigger: FixedDelayTriggerDescriptor,
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
      await runtime.runTask(trigger.task)
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
      await runtime.runTask(trigger.task, validated)
    },
  })
  if (!handle || typeof handle.stop !== 'function') {
    throw new Error(
      `LUTRE_QUEUE_DRIVER_INVALID: Queue ${trigger.queue.name} driver returned an invalid handle.`,
    )
  }
  return handle
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
