export type {
  CapabilityIR,
  ContextKeyIR,
  DependencyEdgeIR,
  DependencyNodeIR,
  Diagnostic,
  EntrypointExecutionRootIR,
  ImplementationIR,
  LayerIR,
  ModuleIR,
  PipelineIR,
  ProtocolExecutionRootIR,
  ProviderIR,
  TokenIR,
} from './ir.js'

import type {
  CapabilityIR,
  ContextKeyIR,
  DependencyEdgeIR,
  DependencyNodeIR,
  Diagnostic,
  EntrypointExecutionRootIR,
  ImplementationIR,
  ModuleIR,
  PipelineIR,
  ProtocolExecutionRootIR,
  ProviderIR,
  TokenIR,
} from './ir.js'

export interface CronTriggerExecutionRootIR {
  readonly id: `trigger:${string}`
  readonly kind: 'trigger'
  readonly trigger: 'cron'
  readonly name: string
  readonly expression: string
  readonly timezone: string
  readonly overlap: 'allow' | 'skip'
  readonly entrypoint: string
}

export interface FixedDelayTriggerExecutionRootIR {
  readonly id: `trigger:${string}`
  readonly kind: 'trigger'
  readonly trigger: 'fixed-delay'
  readonly name: string
  readonly delay: number
  readonly immediate: boolean
  readonly entrypoint: string
}

export interface QueueConsumerTriggerExecutionRootIR {
  readonly id: `trigger:${string}`
  readonly kind: 'trigger'
  readonly trigger: 'queue-consumer'
  readonly name: string
  readonly queue: string
  readonly entrypoint: string
}

export type TriggerExecutionRootIR =
  | CronTriggerExecutionRootIR
  | FixedDelayTriggerExecutionRootIR
  | QueueConsumerTriggerExecutionRootIR

export type ExecutionRootIR =
  | ProtocolExecutionRootIR
  | EntrypointExecutionRootIR
  | TriggerExecutionRootIR

export interface QueueIR {
  readonly id: `queue:${string}`
  readonly name: string
  readonly payloadSchema: string
}

export interface ApplicationGraphIR {
  readonly version: 4
  readonly modules: readonly ModuleIR[]
  readonly providers: readonly ProviderIR[]
  readonly tokens: readonly TokenIR[]
  readonly contextKeys: readonly ContextKeyIR[]
  readonly contracts: readonly string[]
  readonly pipelines: readonly PipelineIR[]
  readonly implementations: readonly ImplementationIR[]
  readonly queues: readonly QueueIR[]
  readonly executions: readonly ExecutionRootIR[]
  readonly capabilities: readonly CapabilityIR[]
  readonly hostCapabilities: readonly string[]
  readonly nodes: readonly DependencyNodeIR[]
  readonly edges: readonly DependencyEdgeIR[]
  readonly diagnostics: readonly Diagnostic[]
}

export interface CompilationResult {
  readonly graph: ApplicationGraphIR
  readonly diagnostics: readonly Diagnostic[]
}
