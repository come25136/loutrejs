import type { RuntimeExecutionMetadata } from '../core/instrumentation.js'
import type { DevtoolsValuePreview } from './values.js'

export type RuntimeSpanKind =
  | 'execution'
  | 'http.request'
  | 'http.middleware'
  | 'http.handler'
  | 'task.handler'
  | 'message-port.handler'
  | 'websocket.handler'
  | 'di.resolve'
  | 'provider.construct'
  | 'provider.method'
  | 'response'
  | 'dependency'
  | 'custom'

export interface SerializedDevtoolsError {
  readonly name?: string
  readonly message: string
  readonly stack?: string
}

export interface RuntimeEventBase {
  readonly runId: string
  readonly seq: number
  readonly timestamp: number
  readonly traceId?: string
  readonly spanId?: string
  readonly parentSpanId?: string
  readonly graphNodeId?: string
}

export interface ExecutionStartedEvent extends RuntimeEventBase {
  readonly type: 'execution.started'
  readonly traceId: string
  readonly spanId: string
  readonly executionId: string
  readonly executionKind: string
  readonly name: string
  readonly input?: DevtoolsValuePreview
  readonly capsuleId?: string
  readonly replayable?: boolean
  readonly replayModes?: readonly ('direct' | 'transport')[]
  readonly replayedFromTraceId?: string
  readonly replayedFromCapsuleId?: string
}

export interface ExecutionEndedEvent extends RuntimeEventBase {
  readonly type: 'execution.ended'
  readonly traceId: string
  readonly spanId: string
  readonly executionId: string
  readonly durationMs: number
  readonly status: 'ok' | 'error' | 'cancelled'
  readonly attributes?: Readonly<Record<string, unknown>>
  readonly result?: DevtoolsValuePreview
  readonly error?: SerializedDevtoolsError
}

export interface SpanStartedEvent extends RuntimeEventBase {
  readonly type: 'span.started'
  readonly spanId: string
  readonly traceId: string
  readonly kind: RuntimeSpanKind
  readonly name: string
  readonly attributes?: Readonly<Record<string, unknown>>
  readonly input?: DevtoolsValuePreview
  readonly capsuleId?: string
  readonly replayable?: boolean
  readonly replayModes?: readonly ('direct' | 'transport')[]
}

export interface SpanEndedEvent extends RuntimeEventBase {
  readonly type: 'span.ended'
  readonly spanId: string
  readonly traceId: string
  readonly durationMs: number
  readonly status: 'ok' | 'error' | 'cancelled'
  readonly attributes?: Readonly<Record<string, unknown>>
  readonly result?: DevtoolsValuePreview
  readonly error?: SerializedDevtoolsError
}

export type RuntimeEvent =
  | ExecutionStartedEvent
  | ExecutionEndedEvent
  | SpanStartedEvent
  | SpanEndedEvent

export interface RuntimeObserver {
  readonly runId?: string
  executionStarted?(event: ExecutionStartedEvent): void
  executionEnded?(event: ExecutionEndedEvent): void
  spanStarted?(event: SpanStartedEvent): void
  spanEnded?(event: SpanEndedEvent): void
}

export interface RuntimeExecutionContext extends RuntimeExecutionMetadata {
  readonly traceId: string
  readonly spanId: string
}

export function serializeDevtoolsError(
  error: unknown,
): SerializedDevtoolsError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    }
  }
  return { message: String(error) }
}
