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

export interface ScheduleDescriptor<
  TEntrypoint extends EntrypointDescriptor<void, void> = EntrypointDescriptor<
    void,
    void
  >,
  TName extends string = string,
> {
  readonly kind: 'schedule'
  readonly name: TName
  readonly cron: {
    readonly expression: string
    readonly timezone: string
  }
  readonly entrypoint: TEntrypoint
}

type ScheduledEntrypointConstraint<TEntrypoint> = [
  EntrypointInput<TEntrypoint>,
] extends [void]
  ? [EntrypointOutput<TEntrypoint>] extends [void]
    ? unknown
    : never
  : never

export function schedule<
  const TEntrypoint extends EntrypointDescriptor<any, any>,
  const TName extends string,
>(
  declaration: {
    readonly name: TName
    readonly cron: {
      readonly expression: string
      readonly timezone: string
    }
    readonly entrypoint: TEntrypoint
  } & ScheduledEntrypointConstraint<TEntrypoint>,
): ScheduleDescriptor<TEntrypoint & EntrypointDescriptor<void, void>, TName> {
  return Object.freeze({
    kind: 'schedule',
    name: declaration.name,
    cron: Object.freeze({ ...declaration.cron }),
    entrypoint: declaration.entrypoint,
  })
}

declare const queuePayload: unique symbol

export interface QueueDescriptor<
  TPayload = unknown,
  TName extends string = string,
> {
  readonly kind: 'queue'
  readonly name: TName
  /** @internal Queue payload型を保持するためのメタデータ。 */
  readonly [queuePayload]?: TPayload
}

export type QueuePayload<T> =
  T extends QueueDescriptor<infer TPayload, any> ? TPayload : never

export function queue<
  TPayload,
  const TName extends string = string,
>(declaration: { readonly name: TName }): QueueDescriptor<TPayload, TName> {
  return Object.freeze({
    kind: 'queue',
    name: declaration.name,
  })
}

export interface QueueConsumerDescriptor<
  TQueue extends QueueDescriptor<any> = QueueDescriptor<any>,
  TEntrypoint extends EntrypointDescriptor<any, void> = EntrypointDescriptor<
    any,
    void
  >,
  TName extends string = string,
> {
  readonly kind: 'queue-consumer'
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

export function consumer<
  const TQueue extends QueueDescriptor<any>,
  const TEntrypoint extends EntrypointDescriptor<any, any>,
  const TName extends string,
>(
  declaration: {
    readonly name: TName
    readonly queue: TQueue
    readonly entrypoint: TEntrypoint
  } & ConsumerEntrypointConstraint<TQueue, TEntrypoint>,
): QueueConsumerDescriptor<
  TQueue,
  TEntrypoint & EntrypointDescriptor<QueuePayload<TQueue>, void>,
  TName
> {
  return Object.freeze({
    kind: 'queue-consumer',
    name: declaration.name,
    queue: declaration.queue,
    entrypoint: declaration.entrypoint,
  })
}
