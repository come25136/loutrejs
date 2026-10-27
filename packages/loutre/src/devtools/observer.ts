import type {
  RunId,
  TraceId,
  SpanId,
  CapsuleId,
  EventSequence,
} from './identity.js'
import type { ModelNodeId } from '../core/model/identity.js'
import type { RuntimeExecutionId } from '../core/identity.js'
import type { EpochMs, DurationMs } from '../core/units.js'
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
  readonly runId: RunId
  readonly seq: EventSequence
  readonly timestamp: EpochMs
  readonly traceId?: TraceId
  readonly spanId?: SpanId
  readonly parentSpanId?: SpanId
  readonly graphNodeId?: ModelNodeId
}

export interface ExecutionStartedEvent extends RuntimeEventBase {
  readonly type: 'execution.started'
  readonly traceId: TraceId
  readonly spanId: SpanId
  readonly executionId: RuntimeExecutionId
  readonly executionKind: string
  readonly name: string
  readonly input?: DevtoolsValuePreview
  readonly capsuleId?: CapsuleId
  readonly replayable?: boolean
  readonly replayModes?: readonly ('direct' | 'transport')[]
  readonly replayedFromTraceId?: TraceId
  readonly replayedFromCapsuleId?: CapsuleId
}

export interface ExecutionEndedEvent extends RuntimeEventBase {
  readonly type: 'execution.ended'
  readonly traceId: TraceId
  readonly spanId: SpanId
  readonly executionId: RuntimeExecutionId
  readonly durationMs: DurationMs
  readonly status: 'ok' | 'error' | 'cancelled'
  readonly attributes?: Readonly<Record<string, unknown>>
  readonly result?: DevtoolsValuePreview
  readonly error?: SerializedDevtoolsError
}

export interface SpanStartedEvent extends RuntimeEventBase {
  readonly type: 'span.started'
  readonly spanId: SpanId
  readonly traceId: TraceId
  readonly kind: RuntimeSpanKind
  readonly name: string
  readonly attributes?: Readonly<Record<string, unknown>>
  readonly input?: DevtoolsValuePreview
  readonly capsuleId?: CapsuleId
  readonly replayable?: boolean
  readonly replayModes?: readonly ('direct' | 'transport')[]
}

export interface SpanEndedEvent extends RuntimeEventBase {
  readonly type: 'span.ended'
  readonly spanId: SpanId
  readonly traceId: TraceId
  readonly durationMs: DurationMs
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
  readonly runId?: RunId
  executionStarted?(event: ExecutionStartedEvent): void
  executionEnded?(event: ExecutionEndedEvent): void
  spanStarted?(event: SpanStartedEvent): void
  spanEnded?(event: SpanEndedEvent): void
}

export interface RuntimeExecutionContext extends RuntimeExecutionMetadata {
  readonly traceId: TraceId
  readonly spanId: SpanId
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
