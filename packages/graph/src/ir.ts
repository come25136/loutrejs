export interface ModuleIR {
  readonly id: string
  readonly name?: string
  readonly description?: string
  readonly imports: readonly string[]
  readonly environment: readonly string[]
  readonly providers: readonly string[]
  readonly exports: readonly string[]
  readonly lifecycle: readonly string[]
  readonly requires: readonly string[]
}

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
    | 'implementation'
    | 'layer'
    | 'entrypoint'
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
    readonly key: string
    readonly equals: PropertyKey
  }
}

export interface TokenIR {
  readonly id: string
}

export interface ContextKeyIR {
  readonly name: string
}

export interface LayerIR {
  readonly index: number
  readonly name: string
  readonly role:
    | 'generic'
    | 'authentication'
    | 'guard'
    | 'validation'
    | 'framework'
    | 'terminal'
  readonly requires: readonly string[]
  readonly provides: readonly string[]
  readonly returns?: readonly string[]
  readonly requiresValidated: readonly string[]
  readonly dependencies?: readonly string[]
  readonly attributes?: Readonly<Record<string, string | number | boolean>>
  readonly pipeline?: readonly LayerIR[]
  readonly shortCircuits?: readonly {
    readonly protocol: string
    readonly variant: string
    readonly response?: Readonly<Record<string, unknown>>
  }[]
}

export interface PipelineIR {
  readonly contract: string
  readonly procedure: string
  readonly protocol: string
  readonly layers: readonly LayerIR[]
}

export interface ImplementationIR {
  readonly contract: string
  readonly procedure: string
  readonly protocol: string
  readonly implementation: string
  readonly method: string
}

export interface CapabilityIR {
  readonly name: string
  readonly scope: 'application' | 'execution'
  readonly requiredBy: string
}

export interface ProtocolExecutionRootIR {
  readonly id: `protocol:${string}`
  readonly kind: 'protocol'
  readonly protocol: string
  readonly contract: string
  readonly procedure: string
  readonly implementation: string
}

export interface EntrypointExecutionRootIR {
  readonly id: `entrypoint:${string}`
  readonly kind: 'entrypoint'
  readonly name: string
}

export interface ScheduleExecutionRootIR {
  readonly id: `schedule:${string}`
  readonly kind: 'schedule'
  readonly name: string
  readonly cron: {
    readonly expression: string
    readonly timezone: string
  }
  readonly entrypoint: string
}

export interface QueueConsumerExecutionRootIR {
  readonly id: `queue-consumer:${string}`
  readonly kind: 'queue-consumer'
  readonly name: string
  readonly queue: string
  readonly entrypoint: string
}

export type ExecutionRootIR =
  | ProtocolExecutionRootIR
  | EntrypointExecutionRootIR
  | ScheduleExecutionRootIR
  | QueueConsumerExecutionRootIR

export interface QueueIR {
  readonly id: `queue:${string}`
  readonly name: string
}

export interface ApplicationGraphIR {
  readonly version: 3
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
  readonly nodes: readonly DependencyNodeIR[]
  readonly edges: readonly DependencyEdgeIR[]
  readonly diagnostics: readonly Diagnostic[]
}

export interface Diagnostic {
  readonly code: string
  readonly message: string
  readonly path: string
}

export interface CompilationResult {
  readonly graph: ApplicationGraphIR
  readonly diagnostics: readonly Diagnostic[]
}
