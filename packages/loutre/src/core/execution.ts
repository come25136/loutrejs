import { type SchemaOutput, type StandardSchemaV1 } from './schema.js'
import { token, type Token } from './token.js'

export type TaskRuntime<TInput, TOutput> = [TInput] extends [void]
  ? () => TOutput | Promise<TOutput>
  : (input: TInput) => TOutput | Promise<TOutput>

export interface TaskDescriptor<
  TInput = unknown,
  TOutput = unknown,
  TName extends string = string,
> {
  readonly kind: 'task'
  readonly name: TName
  readonly factory: () => TaskRuntime<TInput, TOutput>
}

export type TaskInput<T> =
  T extends TaskDescriptor<infer TInput, any, any> ? TInput : never

export type TaskOutput<T> =
  T extends TaskDescriptor<any, infer TOutput, any> ? TOutput : never

export type TaskArguments<T> = [TaskInput<T>] extends [void]
  ? readonly []
  : readonly [input: TaskInput<T>]

export function task<
  TInput = void,
  TOutput = void,
  const TName extends string = string,
>(declaration: {
  readonly name: TName
  readonly factory: () => TaskRuntime<TInput, TOutput>
}): TaskDescriptor<TInput, TOutput, TName> {
  return Object.freeze({
    kind: 'task',
    name: declaration.name,
    factory: declaration.factory,
  })
}

type VoidTaskConstraint<TTask> = [TaskInput<TTask>] extends [void]
  ? unknown
  : never

export type CronOverlap = 'allow' | 'skip'

export interface CronTriggerDescriptor<
  TTask extends TaskDescriptor<void, any> = TaskDescriptor<void, any>,
  TName extends string = string,
> {
  readonly kind: 'trigger'
  readonly trigger: 'cron'
  readonly name: TName
  readonly expression: string
  readonly timezone: string
  readonly overlap: CronOverlap
  readonly task: TTask
}

export function cron<
  const TTask extends TaskDescriptor<any, any>,
  const TName extends string,
>(
  declaration: {
    readonly name: TName
    readonly expression: string
    readonly timezone: string
    readonly overlap?: CronOverlap
    readonly task: TTask
  } & VoidTaskConstraint<TTask>,
): CronTriggerDescriptor<TTask & TaskDescriptor<void, any>, TName> {
  return Object.freeze({
    kind: 'trigger',
    trigger: 'cron',
    name: declaration.name,
    expression: declaration.expression,
    timezone: declaration.timezone,
    overlap: declaration.overlap ?? 'skip',
    task: declaration.task as TTask & TaskDescriptor<void, any>,
  })
}

export interface FixedDelayTriggerDescriptor<
  TTask extends TaskDescriptor<void, any> = TaskDescriptor<void, any>,
  TName extends string = string,
> {
  readonly kind: 'trigger'
  readonly trigger: 'fixed-delay'
  readonly name: TName
  readonly delay: number
  readonly immediate: boolean
  readonly task: TTask
}

export function fixedDelay<
  const TTask extends TaskDescriptor<any, any>,
  const TName extends string,
>(
  declaration: {
    readonly name: TName
    readonly delay: number
    readonly immediate?: boolean
    readonly task: TTask
  } & VoidTaskConstraint<TTask>,
): FixedDelayTriggerDescriptor<TTask & TaskDescriptor<void, any>, TName> {
  if (
    !Number.isFinite(declaration.delay) ||
    !Number.isInteger(declaration.delay) ||
    declaration.delay < 0
  ) {
    throw new Error(
      'LUTRE_TRIGGER_INVALID_FIXED_DELAY: fixedDelay.delay must be a non-negative finite integer.',
    )
  }
  return Object.freeze({
    kind: 'trigger',
    trigger: 'fixed-delay',
    name: declaration.name,
    delay: declaration.delay,
    immediate: declaration.immediate ?? false,
    task: declaration.task as TTask & TaskDescriptor<void, any>,
  })
}

const queueDriverToken: unique symbol = Symbol('loutre.queue-driver')

export interface QueueDescriptor<
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
  TName extends string = string,
> {
  readonly kind: 'queue'
  readonly name: TName
  readonly payload: TSchema
  readonly [queueDriverToken]: Token<unknown>
}

export type QueuePayload<T> =
  T extends QueueDescriptor<infer TSchema, any> ? SchemaOutput<TSchema> : never

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
    [queueDriverToken]: token(`loutre.queue-driver.${declaration.name}`),
  })
}

export function queueRuntimeToken(descriptor: QueueDescriptor): Token<unknown> {
  return descriptor[queueDriverToken]
}

export interface QueueConsumerTriggerDescriptor<
  TQueue extends QueueDescriptor<any> = QueueDescriptor<any>,
  TTask extends TaskDescriptor<any, any> = TaskDescriptor<any, any>,
  TName extends string = string,
> {
  readonly kind: 'trigger'
  readonly trigger: 'queue-consumer'
  readonly name: TName
  readonly queue: TQueue
  readonly task: TTask
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
  const TTask extends TaskDescriptor<any, any>,
  const TName extends string,
>(
  declaration: {
    readonly name: TName
    readonly queue: TQueue
    readonly task: TTask
  } & ConsumerTaskConstraint<TQueue, TTask>,
): QueueConsumerTriggerDescriptor<
  TQueue,
  TTask & TaskDescriptor<QueuePayload<TQueue>, any>,
  TName
> {
  return Object.freeze({
    kind: 'trigger',
    trigger: 'queue-consumer',
    name: declaration.name,
    queue: declaration.queue,
    task: declaration.task as TTask & TaskDescriptor<QueuePayload<TQueue>, any>,
  })
}

export type TriggerDescriptor =
  | CronTriggerDescriptor<any, any>
  | FixedDelayTriggerDescriptor<any, any>
  | QueueConsumerTriggerDescriptor<any, any, any>

export type TriggerTask<TTrigger> = TTrigger extends TriggerDescriptor
  ? TTrigger['task']
  : never

/** Graph v3互換compiler専用であり、公開execution modelへEntrypointを戻さない。 */
export type EntrypointRuntime<TInput, TOutput> = TaskRuntime<TInput, TOutput>
/** Graph v3互換compiler専用であり、公開execution modelへEntrypointを戻さない。 */
export type EntrypointDescriptor<
  TInput = unknown,
  TOutput = unknown,
  TName extends string = string,
> = TaskDescriptor<TInput, TOutput, TName>
