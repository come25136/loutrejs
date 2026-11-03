import type {
  ModuleId,
  ProviderNodeId,
  ExecutionNodeId,
  LifecycleNodeId,
  CapabilityNodeId,
  ExtensionNodeId,
} from './identity.js'
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
import type { SourceLocation } from '../source-location.js'

export interface ModuleModelNode {
  readonly kind: 'module'
  readonly id: ModuleId
  readonly name?: string
  readonly description?: string
  readonly source?: SourceLocation
}

export interface ProviderModelNode {
  readonly kind: 'provider'
  readonly id: ProviderNodeId
  readonly token: TokenLike
  readonly provider: ProviderDescriptor
  readonly moduleId: ModuleId | 'application'
  readonly dependencies: readonly TokenLike[]
  readonly source?: SourceLocation
}

export interface ExecutionModelNode<TCompiled = unknown> {
  readonly kind: 'execution'
  readonly id: ExecutionNodeId
  readonly executionKind: string
  readonly moduleId: ModuleId
  readonly dependencies: readonly TokenLike[]
  readonly capabilities: readonly RuntimeCapability[]
  readonly compiled: TCompiled
  readonly source?: SourceLocation
}

export interface LifecycleModelNode {
  readonly kind: 'lifecycle'
  readonly id: LifecycleNodeId
  readonly moduleId: ModuleId
  readonly phase: string
  readonly hook: LifecycleHook<any>
  readonly source?: SourceLocation
}

export type FrameworkModelNode = {
  readonly kind: 'framework'
  readonly name: string
  readonly source?: SourceLocation
} & (
  | {
      readonly frameworkKind: 'runtime-capability'
      readonly id: CapabilityNodeId
    }
  | {
      readonly frameworkKind: 'execution-extension'
      readonly id: ExtensionNodeId
    }
)

export type ApplicationModelNode =
  | ModuleModelNode
  | ProviderModelNode
  | ExecutionModelNode
  | LifecycleModelNode
  | FrameworkModelNode

type Edge<Kind, From, To> = {
  readonly kind: Kind
  readonly from: From
  readonly to: To
}
export type ApplicationModelEdge =
  | Edge<'owns', ModuleId, ProviderNodeId | ExecutionNodeId | LifecycleNodeId>
  | Edge<'imports', ModuleId, ModuleId>
  | Edge<'exports', ModuleId, ProviderNodeId>
  | Edge<
      'injects',
      ProviderNodeId | ExecutionNodeId | LifecycleNodeId,
      ProviderNodeId
    >
  | Edge<'references', ExecutionNodeId, ExecutionNodeId>
  | Edge<'requires', ExecutionNodeId, CapabilityNodeId>
  | Edge<'starts', ExtensionNodeId, ExecutionNodeId>
  | Edge<'wraps', ApplicationModelNode['id'], ApplicationModelNode['id']>

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
