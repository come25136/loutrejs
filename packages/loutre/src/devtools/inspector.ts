import type { SerializedDevtoolsError } from './observer.js'
import type { DevtoolsValuePreview } from './values.js'

export interface ReplayExecutionContext {
  readonly sourceTraceId: string
  readonly sourceCapsuleId: string
  readonly parentTraceId?: string
}

export interface ReplayCapsuleRequest {
  readonly requestId: string
  readonly capsuleId: string
  readonly inputOverride?: unknown
  readonly parentTraceId?: string
}

export interface ProviderPlaygroundRequest {
  readonly requestId: string
  readonly graphNodeId: string
}

export interface ProviderMethodInvocationRequest {
  readonly requestId: string
  readonly graphNodeId: string
  readonly method: string
  readonly args: readonly unknown[]
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

export interface RuntimeInvocationResult {
  readonly requestId: string
  readonly status: 'ok' | 'error'
  readonly traceId?: string
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
  readonly traceId: string
  readonly spanId: string
}

export interface RuntimeDevtoolsContext {
  readonly trace?: RuntimeTraceContext
  readonly replay?: ReplayExecutionContext
}

export interface RuntimeDevtoolsContextStorage {
  run<T>(context: RuntimeDevtoolsContext, operation: () => T): T
  current(): RuntimeDevtoolsContext | undefined
}
