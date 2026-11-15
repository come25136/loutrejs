import { type WebSocketProcedureName } from './identity.js'
import {
  type HttpPathTemplate,
  type HttpNormalizedPath,
} from '../http/identity.js'
import { type ParsedHttpPath } from '../http/path.js'
import {
  type WebSocketHandshakeDefinition,
  type WebSocketMessageCodec,
  type WebSocketContract,
} from './contract.js'
import {
  type ExecutionHandlerSource,
  type ExecutionHandlerResolver,
} from '../core/index.js'

export interface CompiledWebSocketRoute {
  readonly name: WebSocketProcedureName
  readonly path: HttpPathTemplate
  readonly normalizedPath: HttpNormalizedPath
  readonly segments: ParsedHttpPath
  readonly handshake?: WebSocketHandshakeDefinition
  readonly messages?: WebSocketMessageCodec
}

export interface WebSocketDefinition {
  readonly name: string
  readonly contract: WebSocketContract
  readonly handler: ExecutionHandlerSource<unknown>
}

export interface CompiledWebSocketExecution {
  readonly routes: readonly CompiledWebSocketRoute[]
  readonly handler: ExecutionHandlerResolver<unknown>
}
