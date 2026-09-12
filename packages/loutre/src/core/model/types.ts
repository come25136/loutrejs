import type { ArgsClass } from '../args.js'
import type {
  AnyExecutionExtension,
  ExecutionExtension,
  RuntimeCapability,
} from '../extension.js'
import type { LifecycleHook } from '../lifecycle.js'
import type { ModuleInstance, ModuleTemplate } from '../module.js'
import type { ProviderDescriptor } from '../provider.js'
import type { Diagnostic } from '../diagnostic.js'
import type { TokenLike } from '../token.js'

export interface ModuleModelNode {
  readonly kind: 'module'
  readonly id: string
  readonly name?: string
  readonly description?: string
}

export interface ProviderModelNode {
  readonly kind: 'provider'
  readonly id: string
  readonly token: TokenLike
  readonly provider: ProviderDescriptor
  readonly moduleId: string
  readonly dependencies: readonly TokenLike[]
}

export interface ExecutionModelNode<TCompiled = unknown> {
  readonly kind: 'execution'
  readonly id: string
  readonly executionKind: string
  readonly moduleId: string
  readonly dependencies: readonly TokenLike[]
  readonly capabilities: readonly RuntimeCapability[]
  readonly compiled: TCompiled
}

export interface LifecycleModelNode {
  readonly kind: 'lifecycle'
  readonly id: string
  readonly moduleId: string
  readonly phase: string
  readonly hook: LifecycleHook<any>
}

export interface FrameworkModelNode {
  readonly kind: 'framework'
  readonly id: string
  readonly frameworkKind: 'runtime-capability' | 'execution-extension'
  readonly name: string
}

export type ApplicationModelNode =
  | ModuleModelNode
  | ProviderModelNode
  | ExecutionModelNode
  | LifecycleModelNode
  | FrameworkModelNode

export interface ApplicationModelEdge {
  readonly from: string
  readonly to: string
  readonly kind:
    | 'owns'
    | 'imports'
    | 'exports'
    | 'injects'
    | 'references'
    | 'requires'
    | 'starts'
    | 'wraps'
}

export type CompiledOf<TExtension extends AnyExecutionExtension> =
  TExtension extends ExecutionExtension<any, infer TCompiled, any, any, any>
    ? TCompiled
    : never

export interface ApplicationModelExtension<
  TExtension extends AnyExecutionExtension = AnyExecutionExtension,
> {
  readonly extension: TExtension
  readonly executions: readonly ExecutionModelNode<CompiledOf<TExtension>>[]
}

export interface ApplicationModelExtensions extends Iterable<ApplicationModelExtension> {
  get<TExtension extends AnyExecutionExtension>(
    extension: TExtension,
  ): ApplicationModelExtension<TExtension> | undefined
  values(): readonly ApplicationModelExtension[]
}

export interface ApplicationModel {
  readonly kind: 'application-model'
  readonly arguments?: ArgsClass
  readonly providers: readonly ProviderDescriptor[]
  readonly nodes: readonly ApplicationModelNode[]
  readonly edges: readonly ApplicationModelEdge[]
  readonly executions: readonly ExecutionModelNode[]
  readonly extensions: ApplicationModelExtensions
  readonly diagnostics: readonly Diagnostic[]
}

export interface ApplicationModelBuildOptions {
  readonly modules: readonly (ModuleInstance | ModuleTemplate<void>)[]
  readonly arguments?: ArgsClass
}
