export interface ModuleIR {
  readonly id: string
  readonly description?: string
  readonly imports: readonly string[]
  readonly exports: readonly string[]
  readonly requires: readonly string[]
}

export interface ProviderIR {
  readonly token: string
  readonly kind: 'class' | 'value' | 'factory' | 'conditional'
  readonly scope: 'application' | 'transient'
  readonly dependencies: readonly string[]
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
