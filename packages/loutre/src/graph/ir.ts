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
    | 'arguments'
    | 'implementation'
    | 'layer'
    | 'task'
    | 'framework'
  readonly scope?: 'application' | 'transient'
  readonly module?: string
  readonly visibility?: 'private' | 'exported'
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

export type ContractId = `contract:${number}`
export type ImplementationId = `implementation:${number}`

export interface ContractProtocolIR {
  readonly name: string
  readonly dispatchKey: string | null
  readonly interaction: string
}

export interface ContractProcedureIR {
  readonly name: string
  readonly protocols: readonly ContractProtocolIR[]
}

export interface ContractIR {
  readonly id: ContractId
  readonly procedures: readonly ContractProcedureIR[]
}

export interface PipelineIR {
  readonly contract: ContractId
  readonly procedure: string
  readonly protocol: string
  readonly layers: readonly LayerIR[]
}

export interface ImplementationIR {
  readonly id: ImplementationId
  readonly name: string
  readonly contract: ContractId
  readonly protocol: string
  readonly procedures: readonly string[]
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
  readonly contract: ContractId
  readonly procedure: string
  readonly implementation: ImplementationId
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
  readonly modules: readonly ModuleIR[]
  readonly arguments?: ApplicationArgumentsIR
  readonly providers: readonly ProviderIR[]
  readonly tokens: readonly TokenIR[]
  readonly contextKeys: readonly ContextKeyIR[]
  readonly contracts: readonly ContractIR[]
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

export interface Diagnostic {
  readonly code: string
  readonly message: string
  readonly path: string
}

export interface CompilationResult {
  readonly graph: ApplicationGraphIR
  readonly diagnostics: readonly Diagnostic[]
}
