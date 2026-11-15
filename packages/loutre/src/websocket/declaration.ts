import {
  type WebSocketContract,
  type WebSocketRouteTree,
  type WebSocketBranchDefinition,
  type WebSocketHandlers,
  type WebSocketImplementationDefinition,
  type WebSocketDelegatedDefinition,
  type WebSocketCodecKind,
  type WebSocketMessageCodec,
} from './contract.js'
import {
  type ExecutionDefinition,
  defineExecution,
  type ExecutionDelegation,
  type StandardSchemaV1,
} from '../core/index.js'
import { websocketExtension } from './extension.js'
import { type WebSocketDefinition } from './compiled.js'
import { WEBSOCKET_SERVER, bindWebSocketServer } from './capability.js'

export type WebSocketExecutionDefinition<
  TContract extends WebSocketContract = WebSocketContract,
> = { readonly contract: TContract } & ExecutionDefinition<
  typeof websocketExtension
>

type WebSocketV2Tree<TTree extends WebSocketRouteTree> = {
  readonly [K in keyof TTree]: TTree[K] extends WebSocketBranchDefinition
    ? TTree[K] & {
        readonly responses?: never
        readonly routes: WebSocketV2Tree<TTree[K]['routes']>
      }
    : TTree[K] & { readonly request?: never; readonly responses?: never }
}

export function defineWebSocketContract<
  const TRoutes extends WebSocketRouteTree,
>(routes: TRoutes & WebSocketV2Tree<TRoutes>): WebSocketContract<TRoutes> {
  return Object.freeze({
    kind: 'websocket-contract',
    routes,
  }) as WebSocketContract<TRoutes>
}

export function defineWebSocketImplementation<
  const TContract extends WebSocketContract,
>(definition: {
  readonly name?: string
  readonly contract: TContract
  readonly factory: () => WebSocketHandlers<TContract>
}): WebSocketImplementationDefinition<TContract> &
  ExecutionDefinition<typeof websocketExtension>

export function defineWebSocketImplementation(definition: {
  readonly name?: string
  readonly contract: WebSocketContract
  readonly factory: () => unknown
}): ExecutionDefinition<typeof websocketExtension> {
  return defineExecution(websocketExtension, {
    ...definition,
    name: definition.name ?? '',
    handler: { kind: 'factory', factory: definition.factory },
  } satisfies WebSocketDefinition)
}

export function defineWebSocketDelegate<
  const TContract extends WebSocketContract,
>(definition: {
  readonly name?: string
  readonly contract: TContract
  readonly delegate: ExecutionDelegation<NoInfer<WebSocketHandlers<TContract>>>
}): WebSocketDelegatedDefinition<TContract> &
  ExecutionDefinition<typeof websocketExtension>

export function defineWebSocketDelegate(definition: {
  readonly name?: string
  readonly contract: WebSocketContract
  readonly delegate: ExecutionDelegation<unknown>
}): ExecutionDefinition<typeof websocketExtension> {
  return defineExecution(websocketExtension, {
    ...definition,
    name: definition.name ?? '',
    handler: { kind: 'delegate', delegate: definition.delegate },
  } satisfies WebSocketDefinition)
}

function defineCodec<
  const TInput extends StandardSchemaV1 | undefined,
  const TOutput extends StandardSchemaV1 | undefined,
>(
  kind: WebSocketCodecKind,
  definition: { readonly input?: TInput; readonly output?: TOutput },
): WebSocketMessageCodec<TInput, TOutput> {
  if (definition.input === undefined && definition.output === undefined) {
    throw new Error(
      'LUTRE_WEBSOCKET_CODEC_EMPTY: input or output must be declared.',
    )
  }
  return Object.freeze({
    kind,
    input: definition.input as TInput,
    output: definition.output as TOutput,
  })
}

export const websocket = Object.freeze({
  contract: defineWebSocketContract,
  implementation: defineWebSocketImplementation,
  delegate: defineWebSocketDelegate,
  json: <
    const TInput extends StandardSchemaV1 | undefined = undefined,
    const TOutput extends StandardSchemaV1 | undefined = undefined,
  >(definition: {
    readonly input?: TInput
    readonly output?: TOutput
  }) => defineCodec('json', definition),
  text: <
    const TInput extends StandardSchemaV1 | undefined = undefined,
    const TOutput extends StandardSchemaV1 | undefined = undefined,
  >(definition: {
    readonly input?: TInput
    readonly output?: TOutput
  }) => defineCodec('text', definition),
  binary: <
    const TInput extends StandardSchemaV1 | undefined = undefined,
    const TOutput extends StandardSchemaV1 | undefined = undefined,
  >(definition: {
    readonly input?: TInput
    readonly output?: TOutput
  }) => defineCodec('binary', definition),
  extension: websocketExtension,
  serverCapability: WEBSOCKET_SERVER,
  bindServer: bindWebSocketServer,
})
