import { type SchemaOutput, type StandardSchemaV1 } from './schema.js'
import { token, type Token } from './token.js'

export type EntrypointRuntime<TInput, TOutput> = [TInput] extends [void]
  ? () => TOutput | Promise<TOutput>
  : (input: TInput) => TOutput | Promise<TOutput>

export interface EntrypointDescriptor<
  TInput = unknown,
  TOutput = unknown,
  TName extends string = string,
> {
  readonly kind: 'entrypoint'
  readonly name: TName
  readonly factory: () => EntrypointRuntime<TInput, TOutput>
}

export type EntrypointInput<T> =
  T extends EntrypointDescriptor<infer TInput, any, any> ? TInput : never

export type EntrypointOutput<T> =
  T extends EntrypointDescriptor<any, infer TOutput, any> ? TOutput : never

export type EntrypointArguments<T> = [EntrypointInput<T>] extends [void]
  ? readonly []
  : readonly [input: EntrypointInput<T>]

export function entrypoint<
  TInput = void,
  TOutput = void,
  const TName extends string = string,
>(declaration: {
  readonly name: TName
  readonly factory: () => EntrypointRuntime<TInput, TOutput>
}): EntrypointDescriptor<TInput, TOutput, TName> {
  return Object.freeze({
    kind: 'entrypoint',
    name: declaration.name,
    factory: declaration.factory,
  })
}

type VoidEntrypointConstraint<TEntrypoint> = [
  EntrypointInput<TEntrypoint>,
] extends [void]
  ? [EntrypointOutput<TEntrypoint>] extends [void]
    ? unknown
    : never
  : never

export type CronOverlap = 'allow' | 'skip'

export interface CronTriggerDescriptor<
  TEntrypoint extends EntrypointDescriptor<void, void> = EntrypointDescriptor<
    void,
    void
  >,
  TName extends string = string,
> {
  readonly kind: 'trigger'
  readonly trigger: 'cron'
  readonly name: TName
  readonly expression: string
  readonly timezone: string
  readonly overlap: CronOverlap
  readonly entrypoint: TEntrypoint
}

export function cron<
  const TEntrypoint extends EntrypointDescriptor<any, any>,
  const TName extends string,
>(
  declaration: {
    readonly name: TName
    readonly expression: string
    readonly timezone: string
    readonly overlap?: CronOverlap
    readonly entrypoint: TEntrypoint
  } & VoidEntrypointConstraint<TEntrypoint>,
): CronTriggerDescriptor<
  TEntrypoint & EntrypointDescriptor<void, void>,
  TName
> {
  return Object.freeze({
    kind: 'trigger',
    trigger: 'cron',
    name: declaration.name,
    expression: declaration.expression,
    timezone: declaration.timezone,
    overlap: declaration.overlap ?? 'skip',
    entrypoint: declaration.entrypoint,
  })
}

export interface FixedDelayTriggerDescriptor<
  TEntrypoint extends EntrypointDescriptor<void, void> = EntrypointDescriptor<
    void,
    void
  >,
  TName extends string = string,
> {
  readonly kind: 'trigger'
  readonly trigger: 'fixed-delay'
  readonly name: TName
  readonly delay: number
  readonly immediate: boolean
  readonly entrypoint: TEntrypoint
}

export function fixedDelay<
  const TEntrypoint extends EntrypointDescriptor<any, any>,
  const TName extends string,
>(
  declaration: {
    readonly name: TName
    readonly delay: number
    readonly immediate?: boolean
    readonly entrypoint: TEntrypoint
  } & VoidEntrypointConstraint<TEntrypoint>,
): FixedDelayTriggerDescriptor<
  TEntrypoint & EntrypointDescriptor<void, void>,
  TName
> {
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
    entrypoint: declaration.entrypoint,
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
  /** @internal Queue transport binding token. */
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

/** @internal Queue transport adapter and Application Host use this token. */
export function queueRuntimeToken(descriptor: QueueDescriptor): Token<unknown> {
  return descriptor[queueDriverToken]
}

export interface QueueConsumerTriggerDescriptor<
  TQueue extends QueueDescriptor<any> = QueueDescriptor<any>,
  TEntrypoint extends EntrypointDescriptor<any, void> = EntrypointDescriptor<
    any,
    void
  >,
  TName extends string = string,
> {
  readonly kind: 'trigger'
  readonly trigger: 'queue-consumer'
  readonly name: TName
  readonly queue: TQueue
  readonly entrypoint: TEntrypoint
}

type ConsumerEntrypointConstraint<TQueue, TEntrypoint> = [
  EntrypointInput<TEntrypoint>,
] extends [QueuePayload<TQueue>]
  ? [QueuePayload<TQueue>] extends [EntrypointInput<TEntrypoint>]
    ? [EntrypointOutput<TEntrypoint>] extends [void]
      ? unknown
      : never
    : never
  : never

export function consume<
  const TQueue extends QueueDescriptor<any>,
  const TEntrypoint extends EntrypointDescriptor<any, any>,
  const TName extends string,
>(
  declaration: {
    readonly name: TName
    readonly queue: TQueue
    readonly entrypoint: TEntrypoint
  } & ConsumerEntrypointConstraint<TQueue, TEntrypoint>,
): QueueConsumerTriggerDescriptor<
  TQueue,
  TEntrypoint & EntrypointDescriptor<QueuePayload<TQueue>, void>,
  TName
> {
  return Object.freeze({
    kind: 'trigger',
    trigger: 'queue-consumer',
    name: declaration.name,
    queue: declaration.queue,
    entrypoint: declaration.entrypoint,
  })
}

export type TriggerDescriptor =
  | CronTriggerDescriptor<any, any>
  | FixedDelayTriggerDescriptor<any, any>
  | QueueConsumerTriggerDescriptor<any, any, any>

export type TriggerEntrypoint<TTrigger> = TTrigger extends TriggerDescriptor
  ? TTrigger['entrypoint']
  : never
