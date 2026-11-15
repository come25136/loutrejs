import {
  type MessagePortContract,
  type MessagePortImplementationData,
  type MessagePortRouteDefinition,
} from './contract.js'
import { type ExecutionDefinition, defineExecution } from '../core/index.js'
import { messagePortExtension } from './extension.js'
import { type MessagePortDefinition } from './compiled.js'

export type MessagePortExecutionDefinition<
  TContract extends MessagePortContract = MessagePortContract,
> = MessagePortImplementationData<TContract> &
  ExecutionDefinition<typeof messagePortExtension>

export function defineMessagePortContract<
  const TRoutes extends Readonly<Record<string, MessagePortRouteDefinition>>,
>(routes: TRoutes): MessagePortContract<TRoutes> {
  return Object.freeze({
    kind: 'message-port-contract',
    routes,
  }) as MessagePortContract<TRoutes>
}

export function defineMessagePortImplementation<
  const TContract extends MessagePortContract,
>(definition: {
  readonly name?: string
  readonly contract: TContract
  readonly factory: MessagePortImplementationData<TContract>['factory']
}): MessagePortExecutionDefinition<TContract>

export function defineMessagePortImplementation(definition: {
  readonly name?: string
  readonly contract: MessagePortContract
  readonly factory: () => unknown
}): ExecutionDefinition<typeof messagePortExtension> {
  return defineExecution(messagePortExtension, {
    ...definition,
    name: definition.name ?? '',
    contract: definition.contract,
    handler: { kind: 'factory', factory: definition.factory },
  } satisfies MessagePortDefinition)
}

export const messagePort = Object.freeze({
  contract: defineMessagePortContract,
  implementation: defineMessagePortImplementation,
  extension: messagePortExtension,
})
