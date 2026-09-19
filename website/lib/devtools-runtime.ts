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
  readonly runId: string
  readonly application: {
    readonly name?: string
    readonly runtime?: string
    readonly pid?: number
  }
  readonly connectedAt: number
  readonly stoppedAt?: number
}

export interface DevtoolsTraceSummary {
  readonly traceId: string
  readonly runId: string
  readonly executionId: string
  readonly executionKind: string
  readonly name: string
  readonly graphNodeId?: string
  readonly startedAt: number
  readonly durationMs?: number
  readonly status: 'running' | 'ok' | 'error' | 'cancelled'
  readonly attributes?: Readonly<Record<string, unknown>>
  readonly input?: DevtoolsValuePreview
  readonly capsuleId?: string
  readonly replayable?: boolean
  readonly replayModes?: readonly ReplayMode[]
  readonly replayedFromTraceId?: string
  readonly replayedFromCapsuleId?: string
}

export interface RuntimeEventBase {
  readonly type: string
  readonly runId: string
  readonly seq: number
  readonly timestamp: number
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId?: string
  readonly graphNodeId?: string
}

export interface ExecutionStartedEvent extends RuntimeEventBase {
  readonly type: 'execution.started'
  readonly executionId: string
  readonly executionKind: string
  readonly name: string
  readonly input?: DevtoolsValuePreview
  readonly capsuleId?: string
  readonly replayable?: boolean
  readonly replayModes?: readonly ReplayMode[]
  readonly replayedFromTraceId?: string
  readonly replayedFromCapsuleId?: string
}

export interface ExecutionEndedEvent extends RuntimeEventBase {
  readonly type: 'execution.ended'
  readonly executionId: string
  readonly durationMs: number
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
  readonly capsuleId?: string
  readonly replayable?: boolean
  readonly replayModes?: readonly ReplayMode[]
}

export interface SpanEndedEvent extends RuntimeEventBase {
  readonly type: 'span.ended'
  readonly durationMs: number
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
  readonly requestId: string
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
    onMessage({
      event: message.event,
      events: message.payload as RuntimeEvent[],
    })
  })
}

export async function fetchRuns(
  baseUrl: string,
): Promise<readonly DevtoolsRun[]> {
  const payload = await devtoolsRequest<{ runs?: unknown }>(
    baseUrl,
    'runtime.runs',
  )
  if (!Array.isArray(payload.runs))
    throw new Error('Invalid runtime runs response.')
  return payload.runs as DevtoolsRun[]
}

export async function fetchTraces(
  baseUrl: string,
): Promise<readonly DevtoolsTraceSummary[]> {
  const payload = await devtoolsRequest<{ traces?: unknown }>(
    baseUrl,
    'runtime.traces',
  )
  if (!Array.isArray(payload.traces))
    throw new Error('Invalid runtime traces response.')
  return payload.traces as DevtoolsTraceSummary[]
}

export async function clearTraces(baseUrl: string): Promise<number> {
  const payload = await devtoolsRequest<{ cleared?: unknown }>(
    baseUrl,
    'runtime.traces.clear',
  )
  if (typeof payload.cleared !== 'number')
    throw new Error('Invalid clear traces response.')
  return payload.cleared
}

export async function fetchTrace(
  baseUrl: string,
  traceId: string,
): Promise<readonly RuntimeEvent[]> {
  const payload = await devtoolsRequest<{ events?: unknown }>(
    baseUrl,
    'runtime.trace.get',
    { traceId },
  )
  if (!Array.isArray(payload.events)) throw new Error('Invalid trace response.')
  return payload.events as RuntimeEvent[]
}

export async function replayCapsule(
  baseUrl: string,
  capsuleId: string,
  inputOverride: unknown,
): Promise<ReplayResult> {
  return devtoolsRequest<ReplayResult>(baseUrl, 'runtime.capsule.replay', {
    capsuleId,
    inputOverride,
  })
}

export interface ProviderPlaygroundMethod {
  readonly name: string
  readonly arity: number
}

export interface ProviderPlaygroundDescriptor {
  readonly requestId: string
  readonly graphNodeId: string
  readonly providerName: string
  readonly methods: readonly ProviderPlaygroundMethod[]
}

export interface ProviderMethodInvocationResult extends ReplayResult {
  readonly traceId?: string
}

export async function fetchProviderPlayground(
  baseUrl: string,
  graphNodeId: string,
): Promise<ProviderPlaygroundDescriptor> {
  const payload = await devtoolsRequest<ProviderPlaygroundDescriptor>(
    baseUrl,
    'runtime.provider.playground',
    { graphNodeId },
  )
  if (!Array.isArray(payload.methods)) {
    throw new Error('Invalid Provider Playground response.')
  }
  return payload
}

export async function invokeProviderMethod(
  baseUrl: string,
  graphNodeId: string,
  method: string,
  args: readonly unknown[],
): Promise<ProviderMethodInvocationResult> {
  return devtoolsRequest<ProviderMethodInvocationResult>(
    baseUrl,
    'runtime.provider.invoke',
    { graphNodeId, method, args },
  )
}
