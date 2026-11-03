import type {
  RunId,
  TraceId,
  SpanId,
  CapsuleId,
  InspectorRequestId,
  EventSequence,
  EpochMs,
  DurationMs,
  RuntimeExecutionId,
  ModelNodeId,
  ProviderNodeId,
} from './devtools-identity'
import {
  isRecord,
  parseRuntimeEvents,
  parseRun,
  parseTraceSummary,
  parseInvocationResult,
  parseProviderPlayground,
} from './devtools-decoder'
import { devtoolsRequest, subscribeDevtoolsEvents } from './devtools-client'

export type ReplayMode = 'direct' | 'transport'

export interface DevtoolsValuePreview {
  readonly value?: unknown
  readonly preview: string
  readonly truncated?: boolean
  readonly redacted?: boolean
  readonly type?: string
}

export interface DevtoolsRun {
  readonly runId: RunId
  readonly application: {
    readonly name?: string
    readonly runtime?: string
    readonly pid?: number
  }
  readonly connectedAt: EpochMs
  readonly stoppedAt?: EpochMs
}

export interface DevtoolsTraceSummary {
  readonly traceId: TraceId
  readonly runId: RunId
  readonly executionId: RuntimeExecutionId
  readonly executionKind: string
  readonly name: string
  readonly graphNodeId?: ModelNodeId
  readonly startedAt: EpochMs
  readonly durationMs?: DurationMs
  readonly status: 'running' | 'ok' | 'error' | 'cancelled'
  readonly attributes?: Readonly<Record<string, unknown>>
  readonly input?: DevtoolsValuePreview
  readonly capsuleId?: CapsuleId
  readonly replayable?: boolean
  readonly replayModes?: readonly ReplayMode[]
  readonly replayedFromTraceId?: TraceId
  readonly replayedFromCapsuleId?: CapsuleId
}

export interface RuntimeEventBase {
  readonly type: string
  readonly runId: RunId
  readonly seq: EventSequence
  readonly timestamp: EpochMs
  readonly traceId: TraceId
  readonly spanId: SpanId
  readonly parentSpanId?: SpanId
  readonly graphNodeId?: ModelNodeId
}

export interface ExecutionStartedEvent extends RuntimeEventBase {
  readonly type: 'execution.started'
  readonly executionId: RuntimeExecutionId
  readonly executionKind: string
  readonly name: string
  readonly input?: DevtoolsValuePreview
  readonly capsuleId?: CapsuleId
  readonly replayable?: boolean
  readonly replayModes?: readonly ReplayMode[]
  readonly replayedFromTraceId?: TraceId
  readonly replayedFromCapsuleId?: CapsuleId
}

export interface ExecutionEndedEvent extends RuntimeEventBase {
  readonly type: 'execution.ended'
  readonly executionId: RuntimeExecutionId
  readonly durationMs: DurationMs
  readonly status: 'ok' | 'error' | 'cancelled'
  readonly attributes?: Readonly<Record<string, unknown>>
  readonly result?: DevtoolsValuePreview
  readonly error?: {
    readonly name?: string
    readonly message: string
    readonly stack?: string
  }
}

export interface SpanStartedEvent extends RuntimeEventBase {
  readonly type: 'span.started'
  readonly kind: string
  readonly name: string
  readonly attributes?: Readonly<Record<string, unknown>>
  readonly input?: DevtoolsValuePreview
  readonly capsuleId?: CapsuleId
  readonly replayable?: boolean
  readonly replayModes?: readonly ReplayMode[]
}

export interface SpanEndedEvent extends RuntimeEventBase {
  readonly type: 'span.ended'
  readonly durationMs: DurationMs
  readonly status: 'ok' | 'error' | 'cancelled'
  readonly attributes?: Readonly<Record<string, unknown>>
  readonly result?: DevtoolsValuePreview
  readonly error?: {
    readonly name?: string
    readonly message: string
    readonly stack?: string
  }
}

export type RuntimeEvent =
  | ExecutionStartedEvent
  | ExecutionEndedEvent
  | SpanStartedEvent
  | SpanEndedEvent

export interface ReplayResult {
  readonly requestId: InspectorRequestId
  readonly status: 'ok' | 'error'
  readonly result?: DevtoolsValuePreview
  readonly error?: {
    readonly name?: string
    readonly message: string
    readonly stack?: string
  }
}

export interface RuntimeEventStreamMessage {
  readonly event: 'runtime.batch' | 'runtime.snapshot'
  readonly events: readonly RuntimeEvent[]
}

export function subscribeRuntimeEvents(
  baseUrl: string,
  onMessage: (message: RuntimeEventStreamMessage) => void,
): () => void {
  return subscribeDevtoolsEvents(baseUrl, (message) => {
    if (
      (message.event !== 'runtime.batch' &&
        message.event !== 'runtime.snapshot') ||
      !Array.isArray(message.payload)
    ) {
      return
    }
    let events: readonly RuntimeEvent[]
    try {
      events = parseRuntimeEvents(message.payload)
    } catch {
      return
    }
    onMessage({
      event: message.event,
      events,
    })
  })
}

export async function fetchRuns(
  baseUrl: string,
): Promise<readonly DevtoolsRun[]> {
  const payload = await devtoolsRequest(baseUrl, 'runtime.runs')
  if (!isRecord(payload) || !Array.isArray(payload.runs))
    throw new Error('Invalid runtime runs response.')
  return payload.runs.map(parseRun)
}

export async function fetchTraces(
  baseUrl: string,
): Promise<readonly DevtoolsTraceSummary[]> {
  const payload = await devtoolsRequest(baseUrl, 'runtime.traces')
  if (!isRecord(payload) || !Array.isArray(payload.traces))
    throw new Error('Invalid runtime traces response.')
  return payload.traces.map(parseTraceSummary)
}

export async function clearTraces(baseUrl: string): Promise<number> {
  const payload = await devtoolsRequest(baseUrl, 'runtime.traces.clear')
  if (!isRecord(payload) || typeof payload.cleared !== 'number')
    throw new Error('Invalid clear traces response.')
  return payload.cleared
}

export async function fetchTrace(
  baseUrl: string,
  traceId: TraceId,
): Promise<readonly RuntimeEvent[]> {
  const payload = await devtoolsRequest(baseUrl, 'runtime.trace.get', {
    traceId,
  })
  if (!isRecord(payload)) throw new Error('Invalid trace response.')
  return parseRuntimeEvents(payload.events)
}

export async function replayCapsule(
  baseUrl: string,
  capsuleId: CapsuleId,
  inputOverride: unknown,
): Promise<ReplayResult> {
  return parseInvocationResult(
    await devtoolsRequest(baseUrl, 'runtime.capsule.replay', {
      capsuleId,
      inputOverride,
    }),
  )
}

export interface ProviderPlaygroundMethod {
  readonly name: string
  readonly arity: number
}

export interface ProviderPlaygroundDescriptor {
  readonly requestId: InspectorRequestId
  readonly graphNodeId: ProviderNodeId
  readonly providerName: string
  readonly methods: readonly ProviderPlaygroundMethod[]
}

export interface ProviderMethodInvocationResult extends ReplayResult {
  readonly traceId?: TraceId
}

export async function fetchProviderPlayground(
  baseUrl: string,
  graphNodeId: ProviderNodeId,
): Promise<ProviderPlaygroundDescriptor> {
  const payload = await devtoolsRequest(
    baseUrl,
    'runtime.provider.playground',
    { graphNodeId },
  )
  return parseProviderPlayground(payload)
}

export async function invokeProviderMethod(
  baseUrl: string,
  graphNodeId: ProviderNodeId,
  method: string,
  args: readonly unknown[],
): Promise<ProviderMethodInvocationResult> {
  return parseInvocationResult(
    await devtoolsRequest(baseUrl, 'runtime.provider.invoke', {
      graphNodeId,
      method,
      args,
    }),
  )
}
