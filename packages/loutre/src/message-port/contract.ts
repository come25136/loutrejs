import {
  type StandardSchemaV1,
  type SchemaOutput,
  type ExecutionExtensionDrainContext,
} from '../core/index.js'
import { type Descriptor } from '../internal/brand.js'
import { type MessagePortProcedureName } from './identity.js'

export interface MessagePortServerStreamResponseDefinition {
  readonly body: StandardSchemaV1
  readonly stream: 'server'
}

export type MessagePortResponseDefinition =
  | StandardSchemaV1
  | MessagePortServerStreamResponseDefinition

export interface MessagePortRouteDefinition {
  readonly input?: StandardSchemaV1
  readonly responses: Readonly<Record<string, MessagePortResponseDefinition>>
}

export interface MessagePortContract<
  TRoutes extends Readonly<Record<string, MessagePortRouteDefinition>> =
    Readonly<Record<string, MessagePortRouteDefinition>>,
> extends Descriptor<'message-port-contract'> {
  readonly kind: 'message-port-contract'
  readonly routes: TRoutes
}

export interface MessagePortResult<
  TVariant extends string = string,
  TValue = unknown,
> {
  readonly kind: 'message-port-result'
  readonly response: TVariant
  readonly value: TValue
}

export type MessagePortInvocationResult =
  | {
      readonly kind: 'unary'
      readonly response: string
      readonly value: unknown
    }
  | {
      readonly kind: 'stream'
      readonly response: string
      readonly value: AsyncIterable<unknown>
    }

type MessagePortResponseValue<TResponse extends MessagePortResponseDefinition> =
  TResponse extends MessagePortServerStreamResponseDefinition
    ? AsyncIterable<SchemaOutput<TResponse['body']>>
    : TResponse extends StandardSchemaV1
      ? SchemaOutput<TResponse>
      : never

type ResponseHelpers<TRoute extends MessagePortRouteDefinition> = {
  readonly [TVariant in keyof TRoute['responses'] & string]: (
    value: MessagePortResponseValue<TRoute['responses'][TVariant]>,
  ) => MessagePortResult<
    TVariant,
    MessagePortResponseValue<TRoute['responses'][TVariant]>
  >
}

export interface MessagePortContext<
  TRoute extends MessagePortRouteDefinition = MessagePortRouteDefinition,
> {
  readonly input: TRoute['input'] extends StandardSchemaV1
    ? SchemaOutput<TRoute['input']>
    : unknown
  readonly response: ResponseHelpers<TRoute>
  readonly signal: AbortSignal
}

export type MessagePortHandlers<TContract extends MessagePortContract> = {
  readonly [TName in keyof TContract['routes']]: (
    context: MessagePortContext<TContract['routes'][TName]>,
  ) => MessagePortResult | Promise<MessagePortResult>
}

export interface MessagePortImplementationData<
  TContract extends MessagePortContract = MessagePortContract,
> {
  readonly name: string
  readonly contract: TContract
  readonly factory: () => MessagePortHandlers<TContract>
}

export interface MessagePortExtensionRuntime {
  invoke(
    method: MessagePortProcedureName,
    input?: unknown,
  ): Promise<MessagePortInvocationResult>
  drain(context: ExecutionExtensionDrainContext): Promise<void>
}

export interface MessagePortHostApi {
  invoke(method: string, input?: unknown): Promise<MessagePortInvocationResult>
}
