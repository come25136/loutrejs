import {
  type StandardSchemaV1,
  type Token,
  type SchemaOutput,
  token,
  provide,
  type ProviderDescriptor,
} from '../core/index.js'
import { type QueueName, queueName } from './identity.js'

const queueDriverToken: unique symbol = Symbol.for(
  'loutre.tasks.queue-driver',
) as typeof queueDriverToken

export interface QueueDescriptor<
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
  TName extends string = string,
> {
  readonly kind: 'queue'
  readonly name: QueueName<TName>
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

export function queue<
  const TSchema extends StandardSchemaV1,
  const TName extends string = string,
>(declaration: {
  readonly name: TName
  readonly payload: TSchema
}): QueueDescriptor<TSchema, TName> {
  const payload: unknown = declaration.payload
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
    name: queueName(declaration.name),
    payload: declaration.payload,
    [queueDriverToken]: token<QueueConsumerDriver>(
      `loutre.tasks.queue-driver.${declaration.name}`,
    ),
  })
}

export function queueRuntimeToken(
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
