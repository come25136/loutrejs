import {
  type StandardSchemaV1,
  type ExecutionHandlerSource,
  type ExecutionHandlerResolver,
} from '../core/index.js'
import { type MessagePortContract } from './contract.js'

type CompiledMessagePortResponse =
  | { readonly kind: 'unary'; readonly schema: StandardSchemaV1 }
  | { readonly kind: 'stream'; readonly schema: StandardSchemaV1 }

export interface CompiledMessagePortRoute {
  readonly input?: StandardSchemaV1
  readonly responses: Readonly<Record<string, CompiledMessagePortResponse>>
}

export interface MessagePortDefinition {
  readonly name: string
  readonly contract: MessagePortContract
  readonly handler: ExecutionHandlerSource<unknown>
}

export interface CompiledMessagePortExecution {
  readonly routes: Readonly<Record<string, CompiledMessagePortRoute>>
  readonly handler: ExecutionHandlerResolver<unknown>
}
