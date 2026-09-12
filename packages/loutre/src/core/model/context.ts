import type { Diagnostic } from '../diagnostic.js'
import type { ModuleInstance } from '../module.js'
import { asModuleInstance } from '../module.js'
import type { ModuleTemplate } from '../module.js'
import type { ProviderDescriptor } from '../provider.js'
import type { TokenLike } from '../token.js'
import type {
  ApplicationModelBuildOptions,
  ApplicationModelEdge,
  ApplicationModelNode,
  ExecutionModelNode,
  ProviderModelNode,
} from './types.js'

export interface ModelBuildContext {
  readonly options: ApplicationModelBuildOptions
  readonly modules: readonly ModuleInstance[]
  readonly moduleIds: ReadonlyMap<ModuleInstance, string>
  readonly nodes: ApplicationModelNode[]
  readonly edges: ApplicationModelEdge[]
  readonly diagnostics: Diagnostic[]
  readonly providers: ProviderDescriptor[]
  readonly executions: ExecutionModelNode[]
  readonly providerNodes: Map<TokenLike, ProviderModelNode>
  nextProviderId(): string
}

function collectModules(
  roots: readonly (ModuleInstance | ModuleTemplate<void>)[],
): ModuleInstance[] {
  const result: ModuleInstance[] = []
  const seen = new Set<ModuleInstance>()
  const visit = (candidate: ModuleInstance | ModuleTemplate<void>) => {
    const module = asModuleInstance(candidate)
    if (seen.has(module)) return
    seen.add(module)
    for (const imported of module.definition.imports ?? []) visit(imported)
    result.push(module)
  }
  for (const root of roots) visit(root)
  return result
}

export function createModelBuildContext(
  options: ApplicationModelBuildOptions,
): ModelBuildContext {
  const modules = collectModules(options.modules)
  const moduleIds = new Map(
    modules.map((module, index) => [module, `module:${index + 1}`]),
  )
  let providerOrdinal = 0
  return {
    options,
    modules,
    moduleIds,
    nodes: [],
    edges: [],
    diagnostics: [],
    providers: [],
    executions: [],
    providerNodes: new Map(),
    nextProviderId: () => `provider:${++providerOrdinal}`,
  }
}
