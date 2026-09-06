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

type AnyTaskDefinition = ExecutionDefinition & {
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

const queueDriverToken: unique symbol = Symbol('loutre.tasks.queue-driver')

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

type TasksDefinitionData = TaskDefinitionData | TriggerDefinitionData

export interface TasksCompiledTask {
  readonly type: 'task'
  readonly definition: object
  readonly name: string
  readonly factory: () => (...arguments_: any[]) => any
}

export interface TasksCompiledCronTrigger {
  readonly type: 'cron'
  readonly name: string
  readonly expression: string
  readonly timezone: string
  readonly overlap: CronOverlap
  readonly task: object
}

export interface TasksCompiledFixedDelayTrigger {
  readonly type: 'fixed-delay'
  readonly name: string
  readonly delay: number
  readonly immediate: boolean
  readonly task: object
}

export interface TasksCompiledQueueConsumerTrigger {
  readonly type: 'queue-consumer'
  readonly name: string
  readonly queue: QueueDescriptor
  readonly task: object
}

export type TasksCompiledExecution =
  | TasksCompiledTask
  | TasksCompiledCronTrigger
  | TasksCompiledFixedDelayTrigger
  | TasksCompiledQueueConsumerTrigger

export interface TasksExtensionRuntime {
  run<TInput, TOutput>(
    task: TaskDefinitionData<TInput, TOutput> & ExecutionDefinition,
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
    task: TaskDefinitionData<TInput, TOutput> & ExecutionDefinition,
    ...arguments_: [TInput] extends [void]
      ? readonly []
      : readonly [input: TInput]
  ): Promise<TOutput>
  readonly triggers: {
    start(): Promise<void>
    stop(): Promise<void>
  }
}

export const tasksExtension = defineExecutionExtension<
  TasksDefinitionData & ExecutionDefinition,
  TasksCompiledExecution,
  'tasks',
  TasksHostApi,
  TasksExtensionRuntime
>({
  kind: 'execution-extension',
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
              kind: 'task-consumer',
              id: `task:${definition.name}`,
              name: definition.name,
            },
            () => definition.factory(),
          ),
          capabilities: [],
          compiled: {
            type: 'task',
            definition,
            name: definition.name,
            factory: definition.factory as TasksCompiledTask['factory'],
          },
        }
      case 'cron':
        return {
          kind: 'execution',
          id: `trigger.${definition.name}`,
          executionKind: 'trigger.cron',
          dependencies: [],
          capabilities: [],
          compiled: {
            type: 'cron',
            name: definition.name,
            expression: definition.expression,
            timezone: definition.timezone,
            overlap: definition.overlap,
            task: definition.task,
          },
        }
      case 'fixed-delay':
        return {
          kind: 'execution',
          id: `trigger.${definition.name}`,
          executionKind: 'trigger.fixed-delay',
          dependencies: [],
          capabilities: [],
          compiled: {
            type: 'fixed-delay',
            name: definition.name,
            delay: definition.delay,
            immediate: definition.immediate,
            task: definition.task,
          },
        }
      case 'queue-consumer':
        return {
          kind: 'execution',
          id: `trigger.${definition.name}`,
          executionKind: 'trigger.queue-consumer',
          dependencies: [queueRuntimeToken(definition.queue)],
          capabilities: [],
          compiled: {
            type: 'queue-consumer',
            name: definition.name,
            queue: definition.queue,
            task: definition.task,
          },
        }
    }
  },
  validate({ executions }) {
    const taskDefinitions = new Set(
      executions.flatMap((execution) =>
        execution.compiled.type === 'task'
          ? [execution.compiled.definition]
          : [],
      ),
    )
    const diagnostics: Diagnostic[] = []
    for (const execution of executions) {
      const compiled = execution.compiled
      if (compiled.type === 'task') continue
      if (!taskDefinitions.has(compiled.task)) {
        diagnostics.push({
          code: 'LUTRE_TRIGGER_TASK_MISSING',
          message: `Trigger ${compiled.name} references a Task that is not registered in Module executions.`,
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
          task: taskName(compiled.task),
        }
      case 'fixed-delay':
        return {
          type: 'fixed-delay',
          name: compiled.name,
          delay: compiled.delay,
          immediate: compiled.immediate,
          task: taskName(compiled.task),
        }
      case 'queue-consumer':
        return {
          type: 'queue-consumer',
          name: compiled.name,
          queue: compiled.queue.name,
          task: taskName(compiled.task),
        }
    }
  },
  host: {
    namespace: 'tasks',
    create: ({ runtime }) => ({
      run: (definition, ...arguments_) =>
        runtime.run(definition, ...arguments_),
      triggers: {
        start: () => runtime.startTriggers(),
        stop: () => runtime.stopTriggers(),
      },
    }),
  },
})

export type TaskDefinition<
  TInput = unknown,
  TOutput = unknown,
> = TaskDefinitionData<TInput, TOutput> &
  ExecutionDefinition<typeof tasksExtension>

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
  return defineExecution(tasksExtension, {
    type: 'task' as const,
    name: definition.name,
    factory: definition.factory,
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
  const runtimes = new Map<object, (...arguments_: any[]) => any>()
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
          kind: 'task-consumer',
          id: `task:${compiled.name}`,
          name: compiled.name,
        },
        resolve: (dependency) =>
          applicationRuntime.resolve(dependency, execution.id),
      },
      () => compiled.factory(),
    )
    runtimes.set(compiled.definition, runtime)
  }

  let triggerHandles: TriggerHandle[] = []
  let triggersStarted = false
  let accepting = true

  const run = async (definition: AnyTaskDefinition, ...arguments_: any[]) => {
    if (!accepting) throw new Error('LUTRE_TASKS_DRAINING')
    const runtime = runtimes.get(definition)
    if (!runtime) {
      throw new Error(`LUTRE_TASK_NOT_REGISTERED: ${definition.name}`)
    }
    const lease = applicationRuntime.beginExecution()
    try {
      return await Reflect.apply(runtime, undefined, arguments_)
    } finally {
      lease.complete()
    }
  }

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
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Trigger stop failed')
    }
  }

  return {
    run: run as TasksExtensionRuntime['run'],
    async startTriggers() {
      if (triggersStarted) {
        throw new Error(
          'LUTRE_TRIGGERS_ALREADY_STARTED: Trigger Engine is already started.',
        )
      }
      triggersStarted = true
      const started: TriggerHandle[] = []
      try {
        for (const trigger of triggers) {
          if (trigger.type === 'task') continue
          started.push(await startTrigger(trigger, run, applicationRuntime))
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
    stopTriggers,
    async drain() {
      accepting = false
      await stopTriggers()
    },
    async close() {
      await stopTriggers()
    },
  }
}

type TriggerHandle = { stop(): Promise<void> }

async function startTrigger(
  trigger: Exclude<TasksCompiledExecution, TasksCompiledTask>,
  run: (
    definition: AnyTaskDefinition,
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
    definition: AnyTaskDefinition,
    ...arguments_: any[]
  ) => Promise<unknown>,
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
    if (trigger.overlap === 'skip' && active.size > 0) return
    const execution = run(trigger.task as AnyTaskDefinition).catch(
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
    definition: AnyTaskDefinition,
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
    await run(trigger.task as AnyTaskDefinition).catch(() => undefined)
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
    definition: AnyTaskDefinition,
    ...arguments_: any[]
  ) => Promise<unknown>,
  applicationRuntime: ExecutionKernelRuntime,
): Promise<QueueConsumerHandle> {
  const driver = applicationRuntime.resolve(queueRuntimeToken(trigger.queue))
  if (!driver || typeof driver.start !== 'function') {
    throw new Error(
      `LUTRE_QUEUE_DRIVER_INVALID: Queue ${trigger.queue.name} driver is invalid.`,
    )
  }
  const handle = await driver.start({
    consume: async (payload) => {
      const validated = await validateSchema(trigger.queue.payload, payload)
      await run(trigger.task as AnyTaskDefinition, validated)
    },
  })
  if (!handle || typeof handle.stop !== 'function') {
    throw new Error(
      `LUTRE_QUEUE_DRIVER_INVALID: Queue ${trigger.queue.name} driver returned an invalid handle.`,
    )
  }
  return handle
}

function taskName(definition: object): string {
  return 'name' in definition && typeof definition.name === 'string'
    ? definition.name
    : 'unknown'
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
  return (
    matchesCronField(minute, Number(value('minute')), 0, 59) &&
    matchesCronField(hour, Number(value('hour')), 0, 23) &&
    matchesCronField(dayOfMonth, Number(value('day')), 1, 31) &&
    matchesCronField(month, Number(value('month')), 1, 12) &&
    matchesCronField(dayOfWeek, weekday, 0, 7, true)
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
    const normalized = sundayAlias && value === 0 && start === 7 ? 7 : value
    return (
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      start >= minimum &&
      end <= maximum &&
      normalized >= start &&
      normalized <= end &&
      (normalized - start) % step === 0
    )
  })
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
