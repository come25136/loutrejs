import {
  collectInjectedDependencies,
  defineExecution,
  defineExecutionExtension,
  provide,
  runInInjectionContext,
  token,
  validateSchema,
  type Diagnostic,
  type ExecutionDefinition,
  type ExecutionKernelRuntime,
  type ProviderDescriptor,
  type SchemaOutput,
  type StandardSchemaV1,
  type Token,
} from '@loutrejs/loutre'

export type TaskRuntime<TInput, TOutput> = [TInput] extends [void]
  ? () => TOutput | Promise<TOutput>
  : (input: TInput) => TOutput | Promise<TOutput>

export interface TaskDefinitionData<TInput = unknown, TOutput = unknown> {
  readonly type: 'task'
  readonly name: string
  readonly factory: () => TaskRuntime<TInput, TOutput>
  readonly '~input'?: TInput
  readonly '~output'?: TOutput
}

export type TaskInput<TTask> =
  TTask extends TaskDefinitionData<infer TInput, any> ? TInput : never

export type TaskOutput<TTask> =
  TTask extends TaskDefinitionData<any, infer TOutput> ? TOutput : never

export type TaskArguments<TTask> = [TaskInput<TTask>] extends [void]
  ? readonly []
  : readonly [input: TaskInput<TTask>]

const taskExecutionIdentityKey: unique symbol = Symbol.for(
  'loutre.tasks.task-execution-identity',
) as typeof taskExecutionIdentityKey
const queueDriverToken: unique symbol = Symbol.for(
  'loutre.tasks.queue-driver',
) as typeof queueDriverToken

export interface TaskExecutionIdentity {
  readonly [taskExecutionIdentityKey]: symbol
}

type AnyTaskDefinition = ExecutionDefinition &
  TaskExecutionIdentity & {
    readonly type: 'task'
    readonly name: string
    readonly factory: () => Function
  }

type VoidTaskConstraint<TTask> = [TaskInput<TTask>] extends [void]
  ? unknown
  : never

export type CronOverlap = 'allow' | 'skip'

export interface CronTriggerDefinitionData<
  TTask extends AnyTaskDefinition = AnyTaskDefinition,
> {
  readonly type: 'cron'
  readonly name: string
  readonly expression: string
  readonly timezone: string
  readonly overlap: CronOverlap
  readonly task: TTask
}

export interface FixedDelayTriggerDefinitionData<
  TTask extends AnyTaskDefinition = AnyTaskDefinition,
> {
  readonly type: 'fixed-delay'
  readonly name: string
  readonly delay: number
  readonly immediate: boolean
  readonly task: TTask
}

export interface QueueDescriptor<
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
  TName extends string = string,
> {
  readonly kind: 'queue'
  readonly name: TName
  readonly payload: TSchema
  readonly [queueDriverToken]: Token<QueueConsumerDriver>
}

export type QueuePayload<TQueue> =
  TQueue extends QueueDescriptor<infer TSchema, any>
    ? SchemaOutput<TSchema>
    : never

export interface QueueConsumerHandle {
  stop(): Promise<void>
}

export interface QueueConsumerDriver {
  start(options: {
    consume(payload: unknown): Promise<void>
  }): Promise<QueueConsumerHandle>
}

export interface QueueConsumerTriggerDefinitionData<
  TQueue extends QueueDescriptor<any> = QueueDescriptor<any>,
  TTask extends AnyTaskDefinition = AnyTaskDefinition,
> {
  readonly type: 'queue-consumer'
  readonly name: string
  readonly queue: TQueue
  readonly task: TTask
}

export type TriggerDefinitionData =
  | CronTriggerDefinitionData
  | FixedDelayTriggerDefinitionData
  | QueueConsumerTriggerDefinitionData

type TasksDefinitionData =
  | (TaskDefinitionData & TaskExecutionIdentity)
  | TriggerDefinitionData

export interface TasksCompiledTask {
  readonly type: 'task'
  readonly taskExecutionId: symbol
  readonly name: string
  readonly factory: () => (...arguments_: any[]) => any
}

export interface TasksCompiledCronTrigger {
  readonly type: 'cron'
  readonly name: string
  readonly expression: string
  readonly timezone: string
  readonly overlap: CronOverlap
  readonly taskExecutionId: symbol
  readonly taskName: string
}

export interface TasksCompiledFixedDelayTrigger {
  readonly type: 'fixed-delay'
  readonly name: string
  readonly delay: number
  readonly immediate: boolean
  readonly taskExecutionId: symbol
  readonly taskName: string
}

export interface TasksCompiledQueueConsumerTrigger {
  readonly type: 'queue-consumer'
  readonly name: string
  readonly queueName: string
  readonly queuePayload: StandardSchemaV1
  readonly queueDriver: Token<QueueConsumerDriver>
  readonly taskExecutionId: symbol
  readonly taskName: string
}

export type TasksCompiledExecution =
  | TasksCompiledTask
  | TasksCompiledCronTrigger
  | TasksCompiledFixedDelayTrigger
  | TasksCompiledQueueConsumerTrigger

export interface TasksExtensionRuntime {
  run<TInput, TOutput>(
    taskExecutionId: symbol,
    taskName: string,
    ...arguments_: [TInput] extends [void]
      ? readonly []
      : readonly [input: TInput]
  ): Promise<TOutput>
  startTriggers(): Promise<void>
  stopTriggers(): Promise<void>
  drain(): Promise<void>
  close(): Promise<void>
}

export interface TasksHostApi {
  run<TInput, TOutput>(
    task: TaskDefinitionData<TInput, TOutput> &
      ExecutionDefinition &
      TaskExecutionIdentity,
    ...arguments_: [TInput] extends [void]
      ? readonly []
      : readonly [input: TInput]
  ): Promise<TOutput>
  start(): Promise<void>
  stop(): Promise<void>
}

export const tasksExtension = defineExecutionExtension<
  TasksDefinitionData & ExecutionDefinition,
  TasksCompiledExecution,
  'tasks',
  TasksHostApi,
  TasksExtensionRuntime
>({
  kind: 'execution-extension',
  abiVersion: '1',
  name: '@loutrejs/tasks',
  compile(definition) {
    switch (definition.type) {
      case 'task':
        return {
          kind: 'execution',
          id: `task.${definition.name}`,
          executionKind: 'task.invocation',
          dependencies: collectInjectedDependencies(
            {
              kind: 'execution',
              id: `task:${definition.name}`,
              name: definition.name,
            },
            () => definition.factory(),
          ),
          capabilities: [],
          compiled: Object.freeze({
            type: 'task',
            taskExecutionId: definition[taskExecutionIdentityKey],
            name: definition.name,
            factory: definition.factory as TasksCompiledTask['factory'],
          }),
        }
      case 'cron':
        return {
          kind: 'execution',
          id: `trigger.${definition.name}`,
          executionKind: 'trigger.cron',
          dependencies: [],
          capabilities: [],
          compiled: Object.freeze({
            type: 'cron',
            name: definition.name,
            expression: definition.expression,
            timezone: definition.timezone,
            overlap: definition.overlap,
            taskExecutionId: definition.task[taskExecutionIdentityKey],
            taskName: definition.task.name,
          }),
        }
      case 'fixed-delay':
        return {
          kind: 'execution',
          id: `trigger.${definition.name}`,
          executionKind: 'trigger.fixed-delay',
          dependencies: [],
          capabilities: [],
          compiled: Object.freeze({
            type: 'fixed-delay',
            name: definition.name,
            delay: definition.delay,
            immediate: definition.immediate,
            taskExecutionId: definition.task[taskExecutionIdentityKey],
            taskName: definition.task.name,
          }),
        }
      case 'queue-consumer':
        return {
          kind: 'execution',
          id: `trigger.${definition.name}`,
          executionKind: 'trigger.queue-consumer',
          dependencies: [queueRuntimeToken(definition.queue)],
          capabilities: [],
          compiled: Object.freeze({
            type: 'queue-consumer',
            name: definition.name,
            queueName: definition.queue.name,
            queuePayload: definition.queue.payload,
            queueDriver: queueRuntimeToken(definition.queue),
            taskExecutionId: definition.task[taskExecutionIdentityKey],
            taskName: definition.task.name,
          }),
        }
    }
  },
  references(definition) {
    switch (definition.type) {
      case 'task':
        return []
      case 'cron':
      case 'fixed-delay':
      case 'queue-consumer':
        return [definition.task]
    }
  },
  validate({ executions }) {
    const taskExecutionIds = new Set(
      executions.flatMap((execution) =>
        execution.compiled.type === 'task'
          ? [execution.compiled.taskExecutionId]
          : [],
      ),
    )
    const diagnostics: Diagnostic[] = []
    for (const execution of executions) {
      const compiled = execution.compiled
      if (compiled.type === 'task') continue
      if (!taskExecutionIds.has(compiled.taskExecutionId)) {
        diagnostics.push({
          code: 'LUTRE_TRIGGER_TASK_MISSING',
          message: `Trigger ${compiled.name} references a Task that is unavailable in the compiled Tasks execution set.`,
          path: execution.id,
        })
      }
      if (compiled.type !== 'cron') continue
      if (!isValidCronExpression(compiled.expression)) {
        diagnostics.push({
          code: 'LUTRE_TRIGGER_INVALID_CRON',
          message: `Trigger ${compiled.name} must use a portable 5-field cron expression.`,
          path: execution.id,
        })
      }
      try {
        new Intl.DateTimeFormat('en-US', {
          timeZone: compiled.timezone,
        }).format()
      } catch {
        diagnostics.push({
          code: 'LUTRE_TRIGGER_INVALID_TIMEZONE',
          message: `Trigger ${compiled.name} must use a valid IANA timezone.`,
          path: execution.id,
        })
      }
    }
    return diagnostics
  },
  createRuntime({ executions, applicationRuntime }) {
    return createTasksRuntime(executions, applicationRuntime)
  },
  projectGraph: ({ execution }) => {
    const compiled = execution.compiled
    switch (compiled.type) {
      case 'task':
        return { type: 'task', name: compiled.name }
      case 'cron':
        return {
          type: 'cron',
          name: compiled.name,
          expression: compiled.expression,
          timezone: compiled.timezone,
          overlap: compiled.overlap,
          task: compiled.taskName,
        }
      case 'fixed-delay':
        return {
          type: 'fixed-delay',
          name: compiled.name,
          delay: compiled.delay,
          immediate: compiled.immediate,
          task: compiled.taskName,
        }
      case 'queue-consumer':
        return {
          type: 'queue-consumer',
          name: compiled.name,
          queue: compiled.queueName,
          task: compiled.taskName,
        }
    }
  },
  host: {
    namespace: 'tasks',
    create: ({ runtime }) => ({
      run: (definition, ...arguments_) =>
        Reflect.apply(runtime.run, runtime, [
          taskExecutionIdentity(definition),
          definition.name,
          ...arguments_,
        ]),
      start: () => runtime.startTriggers(),
      stop: () => runtime.stopTriggers(),
    }),
  },
})

export type TaskDefinition<
  TInput = unknown,
  TOutput = unknown,
> = TaskDefinitionData<TInput, TOutput> &
  ExecutionDefinition<typeof tasksExtension> &
  TaskExecutionIdentity

export type CronTriggerDefinition<
  TTask extends TaskDefinition<void, any> = TaskDefinition<void, any>,
> = CronTriggerDefinitionData<TTask> &
  ExecutionDefinition<typeof tasksExtension>

export type FixedDelayTriggerDefinition<
  TTask extends TaskDefinition<void, any> = TaskDefinition<void, any>,
> = FixedDelayTriggerDefinitionData<TTask> &
  ExecutionDefinition<typeof tasksExtension>

export type QueueConsumerTriggerDefinition<
  TQueue extends QueueDescriptor<any> = QueueDescriptor<any>,
  TTask extends AnyTaskDefinition = TaskDefinition<any, any>,
> = QueueConsumerTriggerDefinitionData<TQueue, TTask> &
  ExecutionDefinition<typeof tasksExtension>

export type TriggerDefinition =
  | CronTriggerDefinition
  | FixedDelayTriggerDefinition
  | QueueConsumerTriggerDefinition

export function task<TInput = void, TOutput = void>(definition: {
  readonly name: string
  readonly factory: () => TaskRuntime<TInput, TOutput>
}): TaskDefinition<TInput, TOutput> {
  const taskExecutionId = Symbol(`loutre.tasks.execution:${definition.name}`)
  return defineExecution(tasksExtension, {
    type: 'task' as const,
    name: definition.name,
    factory: definition.factory,
    [taskExecutionIdentityKey]: taskExecutionId,
  }) as TaskDefinition<TInput, TOutput>
}

export function cron<const TTask extends AnyTaskDefinition>(
  declaration: {
    readonly name: string
    readonly expression: string
    readonly timezone: string
    readonly overlap?: CronOverlap
    readonly task: TTask
  } & VoidTaskConstraint<TTask>,
): CronTriggerDefinition<TTask & TaskDefinition<void, any>> {
  return defineExecution(tasksExtension, {
    type: 'cron' as const,
    name: declaration.name,
    expression: declaration.expression,
    timezone: declaration.timezone,
    overlap: declaration.overlap ?? 'skip',
    task: declaration.task as TTask & TaskDefinition<void, any>,
  }) as CronTriggerDefinition<TTask & TaskDefinition<void, any>>
}

export function fixedDelay<const TTask extends AnyTaskDefinition>(
  declaration: {
    readonly name: string
    readonly delay: number
    readonly immediate?: boolean
    readonly task: TTask
  } & VoidTaskConstraint<TTask>,
): FixedDelayTriggerDefinition<TTask & TaskDefinition<void, any>> {
  if (
    !Number.isFinite(declaration.delay) ||
    !Number.isInteger(declaration.delay) ||
    declaration.delay < 0
  ) {
    throw new Error(
      'LUTRE_TRIGGER_INVALID_FIXED_DELAY: fixedDelay.delay must be a non-negative finite integer.',
    )
  }
  return defineExecution(tasksExtension, {
    type: 'fixed-delay' as const,
    name: declaration.name,
    delay: declaration.delay,
    immediate: declaration.immediate ?? false,
    task: declaration.task as TTask & TaskDefinition<void, any>,
  }) as FixedDelayTriggerDefinition<TTask & TaskDefinition<void, any>>
}

export function queue<
  const TSchema extends StandardSchemaV1,
  const TName extends string = string,
>(declaration: {
  readonly name: TName
  readonly payload: TSchema
}): QueueDescriptor<TSchema, TName> {
  const payload = declaration.payload as unknown
  if (
    payload === null ||
    (typeof payload !== 'object' && typeof payload !== 'function') ||
    !('~standard' in payload)
  ) {
    throw new Error(
      'LUTRE_QUEUE_PAYLOAD_SCHEMA: queue.payload must implement Standard Schema.',
    )
  }
  return Object.freeze({
    kind: 'queue',
    name: declaration.name,
    payload: declaration.payload,
    [queueDriverToken]: token<QueueConsumerDriver>(
      `loutre.tasks.queue-driver.${declaration.name}`,
    ),
  })
}

function queueRuntimeToken(
  descriptor: QueueDescriptor,
): Token<QueueConsumerDriver> {
  return descriptor[queueDriverToken]
}

export function bindQueueDriver(
  descriptor: QueueDescriptor,
  driver: QueueConsumerDriver,
): ProviderDescriptor {
  return provide(queueRuntimeToken(descriptor)).useValue(driver)
}

type ConsumerTaskConstraint<TQueue, TTask> = [TaskInput<TTask>] extends [
  QueuePayload<TQueue>,
]
  ? [QueuePayload<TQueue>] extends [TaskInput<TTask>]
    ? unknown
    : never
  : never

export function consume<
  const TQueue extends QueueDescriptor<any>,
  const TTask extends AnyTaskDefinition,
>(
  declaration: {
    readonly name: string
    readonly queue: TQueue
    readonly task: TTask
  } & ConsumerTaskConstraint<TQueue, TTask>,
): QueueConsumerTriggerDefinition<
  TQueue,
  TTask & TaskDefinition<QueuePayload<TQueue>, any>
> {
  return defineExecution(tasksExtension, {
    type: 'queue-consumer' as const,
    name: declaration.name,
    queue: declaration.queue,
    task: declaration.task as TTask & TaskDefinition<QueuePayload<TQueue>, any>,
  }) as QueueConsumerTriggerDefinition<
    TQueue,
    TTask & TaskDefinition<QueuePayload<TQueue>, any>
  >
}

function createTasksRuntime(
  executions: readonly {
    readonly id: string
    readonly compiled: TasksCompiledExecution
  }[],
  applicationRuntime: ExecutionKernelRuntime,
): TasksExtensionRuntime {
  const runtimes = new Map<symbol, (...arguments_: any[]) => any>()
  const triggers: TasksCompiledExecution[] = []
  for (const execution of executions) {
    const compiled = execution.compiled
    if (compiled.type !== 'task') {
      triggers.push(compiled)
      continue
    }
    const runtime = runInInjectionContext(
      {
        consumer: {
          kind: 'execution',
          id: `task:${compiled.name}`,
          name: compiled.name,
        },
        resolve: (dependency) =>
          applicationRuntime.resolve(dependency, execution.id),
      },
      () => compiled.factory(),
    )
    runtimes.set(compiled.taskExecutionId, runtime)
  }

  let triggerHandles: TriggerHandle[] = []
  let triggerStartup: Promise<void> | undefined
  let triggerStop: Promise<void> | undefined
  let triggersStarted = false
  let state: 'running' | 'draining' | 'stopped' = 'running'
  const activeInvocations = new Set<Promise<unknown>>()

  const run = (
    taskExecutionId: symbol,
    taskName: string,
    ...arguments_: any[]
  ): Promise<unknown> => {
    if (state !== 'running') {
      return Promise.reject(new Error(`LUTRE_TASKS_${state.toUpperCase()}`))
    }
    const runtime = runtimes.get(taskExecutionId)
    if (!runtime) {
      return Promise.reject(new Error(`LUTRE_TASK_NOT_REGISTERED: ${taskName}`))
    }
    const invocation = (async () => {
      const lease = applicationRuntime.beginExecution()
      try {
        return await Reflect.apply(runtime, undefined, arguments_)
      } finally {
        lease.complete()
      }
    })()
    activeInvocations.add(invocation)
    void invocation.then(
      () => activeInvocations.delete(invocation),
      () => activeInvocations.delete(invocation),
    )
    return invocation
  }

  const stopTriggers = (): Promise<void> => {
    if (triggerStop) return triggerStop
    const stopping = (async () => {
      const startup = triggerStartup
      if (startup) await startup.catch(() => undefined)
      const handles = triggerHandles
      const stopOrder = handles.toReversed()
      const results = await Promise.allSettled(
        stopOrder.map((handle) => handle.stop()),
      )
      const failedHandles: TriggerHandle[] = []
      const errors: unknown[] = []
      for (const [index, result] of results.entries()) {
        if (result.status !== 'rejected') continue
        failedHandles.push(stopOrder[index]!)
        errors.push(result.reason)
      }
      triggerHandles = failedHandles.toReversed()
      triggersStarted = failedHandles.length > 0
      if (errors.length > 0) {
        throw new AggregateError(errors, 'Trigger stop failed')
      }
    })()
    let trackedStop!: Promise<void>
    trackedStop = stopping.finally(() => {
      if (triggerStop === trackedStop) triggerStop = undefined
    })
    triggerStop = trackedStop
    return trackedStop
  }

  const startTriggers = async (): Promise<void> => {
    if (state !== 'running') {
      throw new Error(`LUTRE_TASKS_${state.toUpperCase()}`)
    }
    if (triggersStarted) {
      throw new Error(
        'LUTRE_TRIGGERS_ALREADY_STARTED: Trigger Engine is already started.',
      )
    }

    const lease = applicationRuntime.beginExecution()
    triggersStarted = true
    const started: TriggerHandle[] = []
    const startup = (async () => {
      try {
        for (const trigger of triggers) {
          if (trigger.type === 'task') continue
          const handle = await startTrigger(trigger, run, applicationRuntime)
          started.push(handle)
          if (state !== 'running') {
            throw tasksStateError(state)
          }
        }
        triggerHandles = started
      } catch (error) {
        const stopOrder = started.toReversed()
        const cleanupResults = await Promise.allSettled(
          stopOrder.map((handle) => handle.stop()),
        )
        const failedHandles: TriggerHandle[] = []
        const cleanupErrors: unknown[] = []
        for (const [index, result] of cleanupResults.entries()) {
          if (result.status !== 'rejected') continue
          failedHandles.push(stopOrder[index]!)
          cleanupErrors.push(result.reason)
        }
        triggerHandles = failedHandles.toReversed()
        triggersStarted = failedHandles.length > 0
        if (cleanupErrors.length > 0) {
          throw new AggregateError(
            [error, ...cleanupErrors],
            'Trigger startup failed and cleanup also failed.',
            { cause: error },
          )
        }
        throw error
      }
    })()
    let trackedStartup!: Promise<void>
    trackedStartup = startup.finally(() => {
      lease.complete()
      if (triggerStartup === trackedStartup) triggerStartup = undefined
    })
    triggerStartup = trackedStartup
    await trackedStartup
  }

  return {
    run: run as TasksExtensionRuntime['run'],
    startTriggers,
    stopTriggers,
    async drain() {
      if (state === 'stopped') return
      state = 'draining'
      await stopTriggers()
      await Promise.allSettled(activeInvocations)
    },
    async close() {
      if (state === 'stopped') return
      try {
        await stopTriggers()
      } finally {
        state = 'stopped'
      }
    },
  }
}

type TriggerHandle = { stop(): Promise<void> }

async function startTrigger(
  trigger: Exclude<TasksCompiledExecution, TasksCompiledTask>,
  run: (
    taskExecutionId: symbol,
    taskName: string,
    ...arguments_: any[]
  ) => Promise<unknown>,
  applicationRuntime: ExecutionKernelRuntime,
): Promise<TriggerHandle> {
  switch (trigger.type) {
    case 'cron':
      return startCronTrigger(trigger, run)
    case 'fixed-delay':
      return startFixedDelayTrigger(trigger, run)
    case 'queue-consumer':
      return startQueueTrigger(trigger, run, applicationRuntime)
  }
}

function startCronTrigger(
  trigger: TasksCompiledCronTrigger,
  run: (
    taskExecutionId: symbol,
    taskName: string,
    ...arguments_: any[]
  ) => Promise<unknown>,
): TriggerHandle {
  let stopped = false
  let lastMinute: number | undefined
  const active = new Set<Promise<unknown>>()
  const tick = () => {
    if (stopped) return
    const now = new Date()
    if (!matchesCronTrigger(trigger, now)) return
    const minute = Math.floor(now.getTime() / 60_000)
    if (lastMinute === minute) return
    lastMinute = minute
    if (trigger.overlap === 'skip' && active.size > 0) return
    const execution = run(trigger.taskExecutionId, trigger.taskName).catch(
      () => undefined,
    )
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
  trigger: TasksCompiledFixedDelayTrigger,
  run: (
    taskExecutionId: symbol,
    taskName: string,
    ...arguments_: any[]
  ) => Promise<unknown>,
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
    await run(trigger.taskExecutionId, trigger.taskName).catch(() => undefined)
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
  trigger: TasksCompiledQueueConsumerTrigger,
  run: (
    taskExecutionId: symbol,
    taskName: string,
    ...arguments_: any[]
  ) => Promise<unknown>,
  applicationRuntime: ExecutionKernelRuntime,
): Promise<QueueConsumerHandle> {
  const driver = applicationRuntime.resolve(trigger.queueDriver)
  if (!driver || typeof driver.start !== 'function') {
    throw new Error(
      `LUTRE_QUEUE_DRIVER_INVALID: Queue ${trigger.queueName} driver is invalid.`,
    )
  }
  const handle = await driver.start({
    consume: async (payload) => {
      const validated = await validateSchema(trigger.queuePayload, payload)
      await run(trigger.taskExecutionId, trigger.taskName, validated)
    },
  })
  if (!handle || typeof handle.stop !== 'function') {
    throw new Error(
      `LUTRE_QUEUE_DRIVER_INVALID: Queue ${trigger.queueName} driver returned an invalid handle.`,
    )
  }
  return handle
}

function taskExecutionIdentity(definition: object): symbol {
  if (
    taskExecutionIdentityKey in definition &&
    typeof definition[taskExecutionIdentityKey] === 'symbol'
  ) {
    return definition[taskExecutionIdentityKey]
  }
  return Symbol('loutre.tasks.unregistered')
}

function tasksStateError(state: string): Error {
  return new Error(`LUTRE_TASKS_${state.toUpperCase()}`)
}

function matchesCronTrigger(
  trigger: Pick<TasksCompiledCronTrigger, 'expression' | 'timezone'>,
  instant: Date,
): boolean {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = trigger.expression
    .trim()
    .split(/\s+/) as [string, string, string, string, string]
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: trigger.timezone,
    minute: 'numeric',
    hour: 'numeric',
    day: 'numeric',
    month: 'numeric',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    value('weekday'),
  )
  const dayOfMonthMatches = matchesCronField(
    dayOfMonth,
    Number(value('day')),
    1,
    31,
  )
  const dayOfWeekMatches = matchesCronField(dayOfWeek, weekday, 0, 7, true)
  const bothDaysRestricted =
    !dayOfMonth.includes('*') && !dayOfWeek.includes('*')
  const dayMatches = bothDaysRestricted
    ? dayOfMonthMatches || dayOfWeekMatches
    : dayOfMonthMatches && dayOfWeekMatches
  return (
    matchesCronField(minute, Number(value('minute')), 0, 59) &&
    matchesCronField(hour, Number(value('hour')), 0, 23) &&
    matchesCronField(month, Number(value('month')), 1, 12) &&
    dayMatches
  )
}

function matchesCronField(
  expression: string,
  value: number,
  minimum: number,
  maximum: number,
  sundayAlias = false,
): boolean {
  return expression.split(',').some((segment) => {
    const [rangeExpression, stepExpression] = segment.split('/')
    const step = stepExpression === undefined ? 1 : Number(stepExpression)
    if (!Number.isInteger(step) || step <= 0 || !rangeExpression) return false
    let start = minimum
    let end = maximum
    if (rangeExpression !== '*') {
      const [startExpression, endExpression] = rangeExpression.split('-')
      start = Number(startExpression)
      end = endExpression === undefined ? start : Number(endExpression)
    }
    const candidates = sundayAlias && value === 0 ? [0, 7] : [value]
    return (
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      start >= minimum &&
      end <= maximum &&
      candidates.some(
        (candidate) =>
          candidate >= start &&
          candidate <= end &&
          (candidate - start) % step === 0,
      )
    )
  })
}

function isValidCronExpression(expression: string): boolean {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) return false
  const ranges = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
  ] as const
  return fields.every((field, index) => {
    const range = ranges[index]
    return range !== undefined && isValidCronField(field, range[0], range[1])
  })
}

function isValidCronField(
  field: string,
  minimum: number,
  maximum: number,
): boolean {
  return field.split(',').every((segment) => {
    const parts = segment.split('/')
    if (parts.length > 2) return false
    const rangeExpression = parts[0]
    const stepExpression = parts[1]
    if (!rangeExpression) return false
    if (
      stepExpression !== undefined &&
      (!/^\d+$/.test(stepExpression) || Number(stepExpression) <= 0)
    ) {
      return false
    }
    if (rangeExpression === '*') return true
    const bounds = rangeExpression.split('-')
    if (bounds.length > 2 || bounds.some((bound) => !/^\d+$/.test(bound))) {
      return false
    }
    const start = Number(bounds[0])
    const end = bounds[1] === undefined ? start : Number(bounds[1])
    return start >= minimum && end <= maximum && start <= end
  })
}
