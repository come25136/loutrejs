import type { Scope } from './provider.js'

export interface RuntimeInvocationRegistration {
  readonly input: unknown
  invoke(input: unknown): unknown | Promise<unknown>
}

export interface RuntimeExecutionMetadata {
  readonly executionId: string
  readonly executionKind: string
  readonly name?: string
  readonly graphNodeId?: string
}

export interface RuntimeOperationMetadata {
  readonly kind: string
  readonly name: string
  readonly graphNodeId?: string
}

export interface RuntimeProviderMetadata {
  readonly providerId: string
  readonly name: string
  readonly graphNodeId: string
  readonly scope: Scope
  readonly providerKind:
    | 'value'
    | 'class'
    | 'factory'
    | 'conditional'
    | 'environment'
    | 'arguments'
}

export interface RuntimeInstrumentationScope {
  run?<T>(operation: () => T): T
  abort?(reason?: unknown): void
  fail?(reason: unknown): void
  annotate?(attributes: Readonly<Record<string, unknown>>): void
  complete(...result: [] | [unknown]): void
}

export interface RuntimeInstrumentation {
  beginExecution?(
    metadata: RuntimeExecutionMetadata,
    invocation?: RuntimeInvocationRegistration,
  ): RuntimeInstrumentationScope | undefined
  beginOperation?(
    metadata: RuntimeOperationMetadata,
    invocation?: RuntimeInvocationRegistration,
  ): RuntimeInstrumentationScope | undefined
  providerCreated?(metadata: RuntimeProviderMetadata, value: unknown): void
  close?(): void | Promise<void>
}
