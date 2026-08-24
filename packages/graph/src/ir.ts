export interface ModuleIR {
  readonly id: string
  readonly name?: string
  readonly description?: string
  readonly imports: readonly string[]
  readonly providers: readonly string[]
  readonly exports: readonly string[]
  readonly lifecycle: readonly string[]
  readonly requires: readonly string[]
}

export interface ProviderIR {
  readonly token: string
  readonly kind: 'class' | 'value' | 'factory' | 'conditional'
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
    | 'implementation'
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
  readonly requiredBy: string
}

export interface ApplicationGraphIR {
  readonly version: 1
  readonly modules: readonly ModuleIR[]
  readonly providers: readonly ProviderIR[]
  readonly tokens: readonly TokenIR[]
  readonly contextKeys: readonly ContextKeyIR[]
  readonly contracts: readonly string[]
  readonly pipelines: readonly PipelineIR[]
  readonly implementations: readonly ImplementationIR[]
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
