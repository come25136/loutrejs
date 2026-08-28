export type {
  CapabilityIR,
  ContextKeyIR,
  Diagnostic,
  ImplementationIR,
  LayerIR,
  ModuleIR,
  PipelineIR,
  ProtocolExecutionRootIR,
  TokenIR,
} from './ir.js'

import type {
  CapabilityIR,
  ContextKeyIR,
  Diagnostic,
  ImplementationIR,
  ModuleIR,
  PipelineIR,
  ProtocolExecutionRootIR,
  TokenIR,
} from './ir.js'

export interface ProviderIR {
  readonly token: string
  readonly kind:
    | 'class'
    | 'value'
    | 'factory'
    | 'conditional'
    | 'environment'
    | 'arguments'
  readonly scope: 'application' | 'transient'
  readonly dependencies: readonly string[]
}

export interface DependencyNodeIR {
  readonly id: string
  readonly label: string
  readonly kind:
    | 'class'
    | 'token'
    | 'factory'
    | 'conditional'
    | 'environment'
    | 'arguments'
    | 'implementation'
    | 'layer'
    | 'task'
    | 'framework'
  readonly scope?: 'application' | 'transient'
  readonly module?: string
}

export interface DependencyEdgeIR {
  readonly from: string
  readonly to: string
  readonly kind:
    | 'inject'
    | 'factory'
    | 'lifecycle'
    | 'conditional'
    | 'framework'
  readonly source: 'declared' | 'probed'
  readonly condition?: {
    readonly source: 'environment' | 'arguments'
    readonly contract: string
    readonly key: string
    readonly equals: PropertyKey
  }
}

export interface ApplicationArgumentsIR {
  readonly name: string
}

export interface TaskIR {
  readonly id: `task:${string}`
  readonly name: string
  readonly public: boolean
}

export interface TaskExecutionRootIR {
  readonly id: `task:${string}`
  readonly kind: 'task'
  readonly name: string
}

export interface CronTriggerExecutionRootIR {
  readonly id: `trigger:${string}`
  readonly kind: 'trigger'
  readonly trigger: 'cron'
  readonly name: string
  readonly expression: string
  readonly timezone: string
  readonly overlap: 'allow' | 'skip'
  readonly task: string
}

export interface FixedDelayTriggerExecutionRootIR {
  readonly id: `trigger:${string}`
  readonly kind: 'trigger'
  readonly trigger: 'fixed-delay'
  readonly name: string
  readonly delay: number
  readonly immediate: boolean
  readonly task: string
}

export interface QueueConsumerTriggerExecutionRootIR {
  readonly id: `trigger:${string}`
  readonly kind: 'trigger'
  readonly trigger: 'queue-consumer'
  readonly name: string
  readonly queue: string
  readonly task: string
}

export type TriggerExecutionRootIR =
  | CronTriggerExecutionRootIR
  | FixedDelayTriggerExecutionRootIR
  | QueueConsumerTriggerExecutionRootIR

export type ExecutionRootIR =
  | ProtocolExecutionRootIR
  | TaskExecutionRootIR
  | TriggerExecutionRootIR

export interface QueueIR {
  readonly id: `queue:${string}`
  readonly name: string
  readonly payloadSchema: string
}

export interface ApplicationGraphIR {
  readonly version: 5
  readonly modules: readonly ModuleIR[]
  readonly arguments?: ApplicationArgumentsIR
  readonly providers: readonly ProviderIR[]
  readonly tokens: readonly TokenIR[]
  readonly contextKeys: readonly ContextKeyIR[]
  readonly contracts: readonly string[]
  readonly pipelines: readonly PipelineIR[]
  readonly implementations: readonly ImplementationIR[]
  readonly tasks: readonly TaskIR[]
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
