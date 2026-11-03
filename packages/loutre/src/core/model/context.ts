import { isLoggerToken } from '../logger-internal.js'
import {
  moduleId,
  providerNodeId,
  type ModuleId,
  type ProviderNodeId,
} from './identity.js'
import type { Diagnostic } from '../diagnostic.js'
import {
  asModuleInstance,
  type ModuleInput,
  type ModuleInstance,
} from '../module.js'
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
  readonly roots: readonly ModuleInstance[]
  readonly modules: readonly ModuleInstance[]
  readonly imports: ReadonlyMap<ModuleInstance, readonly ModuleInstance[]>
  readonly moduleIds: ReadonlyMap<ModuleInstance, ModuleId>
  readonly nodes: ApplicationModelNode[]
  readonly edges: ApplicationModelEdge[]
  readonly diagnostics: Diagnostic[]
  readonly providers: ProviderDescriptor[]
  readonly executions: ExecutionModelNode[]
  readonly providerNodes: Map<TokenLike, ProviderModelNode>
  nextProviderId(): ProviderNodeId
}

function collectModules(roots: readonly ModuleInput[]) {
  const modules: ModuleInstance[] = []
  const imports = new Map<ModuleInstance, readonly ModuleInstance[]>()
  const instances = new Map<ModuleInput, ModuleInstance>()
  const normalize = (input: ModuleInput): ModuleInstance => {
    const existing = instances.get(input)
    if (existing) return existing
    const instance = asModuleInstance(input)
    instances.set(input, instance)
    return instance
  }
  const visit = (input: ModuleInput) => {
    const module = normalize(input)
    if (imports.has(module)) return
    const imported = (module.definition.imports ?? []).map(normalize)
    imports.set(module, imported)
    for (const child of imported) visit(child)
    modules.push(module)
  }
  for (const root of roots) visit(root)
  return { modules, imports, rootModules: roots.map(normalize) }
}

export function createModelBuildContext(
  options: ApplicationModelBuildOptions,
): ModelBuildContext {
  const { modules, imports, rootModules } = collectModules(options.modules)
  const moduleIds = new Map(
    modules.map((module, index) => [module, moduleId(index + 1)]),
  )
  let providerOrdinal = 0
  return {
    options,
    roots: rootModules,
    modules,
    imports,
    moduleIds,
    nodes: [],
    edges: [],
    diagnostics: [],
    providers: [],
    executions: [],
    providerNodes: new Map(),
    nextProviderId: () => providerNodeId(++providerOrdinal),
  }
}

export function findProviderNode(
  context: Pick<ModelBuildContext, 'providerNodes'>,
  token: TokenLike,
): ProviderModelNode | undefined {
  return (
    context.providerNodes.get(token) ??
    (isLoggerToken(token)
      ? [...context.providerNodes.values()].find((node) =>
          isLoggerToken(node.token),
        )
      : undefined)
  )
}
