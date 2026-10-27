import type {
  TraceId,
  SpanId,
  CapsuleId,
  InspectorRequestId,
} from './identity.js'
import type { ProviderNodeId } from '../core/model/identity.js'

import type { SerializedDevtoolsError } from './observer.js'
import type { DevtoolsValuePreview } from './values.js'

export interface ReplayExecutionContext {
  readonly sourceTraceId: TraceId
  readonly sourceCapsuleId: CapsuleId
  readonly parentTraceId?: TraceId
}

export interface ReplayCapsuleRequest {
  readonly requestId: InspectorRequestId
  readonly capsuleId: CapsuleId
  readonly inputOverride?: unknown
  readonly parentTraceId?: TraceId
}

export interface ProviderPlaygroundRequest {
  readonly requestId: InspectorRequestId
  readonly graphNodeId: ProviderNodeId
}

export interface ProviderMethodInvocationRequest {
  readonly requestId: InspectorRequestId
  readonly graphNodeId: ProviderNodeId
  readonly method: string
  readonly args: readonly unknown[]
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

export interface RuntimeInvocationResult {
  readonly requestId: InspectorRequestId
  readonly status: 'ok' | 'error'
  readonly traceId?: TraceId
  readonly result?: DevtoolsValuePreview
  readonly error?: SerializedDevtoolsError
}

export interface RuntimeInspector {
  replayCapsule(request: ReplayCapsuleRequest): Promise<RuntimeInvocationResult>
  providerPlayground(
    request: ProviderPlaygroundRequest,
  ): Promise<ProviderPlaygroundDescriptor>
  invokeProviderMethod(
    request: ProviderMethodInvocationRequest,
  ): Promise<RuntimeInvocationResult>
}

export interface RuntimeTraceContext {
  readonly traceId: TraceId
  readonly spanId: SpanId
}

export interface RuntimeDevtoolsContext {
  readonly trace?: RuntimeTraceContext
  readonly replay?: ReplayExecutionContext
}

export interface RuntimeDevtoolsContextStorage {
  run<T>(context: RuntimeDevtoolsContext, operation: () => T): T
  current(): RuntimeDevtoolsContext | undefined
}
