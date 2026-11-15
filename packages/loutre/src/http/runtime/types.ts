import {
  type HttpMiddlewareContext,
  type HttpRawExecutionContext,
  type HttpMiddlewareOutcome,
} from '../contract.js'
import { createHttpResponseHelpers } from '../result.js'
import { type DependencyResolver } from '../../core/index.js'
import { type ExecutionNodeId } from '../../core/model/identity.js'
import { type CompiledHttpRoute } from '../compiled.js'
import { type EpochMs } from '../../core/units.js'

interface RuntimeHttpContractContext {
  readonly kind: 'contract'
  readonly input: HttpMiddlewareContext['input']
  readonly response: ReturnType<typeof createHttpResponseHelpers>
  readonly signal: AbortSignal
  readonly state: Readonly<Record<string, unknown>>
}

export type RuntimeHttpContext =
  | RuntimeHttpContractContext
  | (HttpRawExecutionContext & { readonly kind: 'raw' })

export type InitialHttpContext = HttpMiddlewareContext &
  Pick<RuntimeHttpContractContext, 'response'>

export interface RuntimeHttpHandlers {
  readonly [name: string]: (
    context: RuntimeHttpContext,
  ) => HttpMiddlewareOutcome | Promise<HttpMiddlewareOutcome>
}

export interface RuntimeHttpRoute {
  readonly resolve: DependencyResolver
  readonly executionId: ExecutionNodeId
  readonly route: CompiledHttpRoute
}

export interface FinalizedHttpResult {
  readonly response: Response
  readonly streamControl?: HttpResponseStreamControl
}

export interface ActiveHttpResponseStream {
  abort(reason: unknown, deadline: EpochMs): Promise<void>
}

export interface HttpResponseStreamControl {
  readonly stream: ReadableStream<Uint8Array>
  readonly finished: Promise<void>
  setDrainDeadline?(deadline: EpochMs): void
  abort(reason: unknown, deadline?: EpochMs): Promise<void>
}

export type ServerSentEventStreamControl = HttpResponseStreamControl
