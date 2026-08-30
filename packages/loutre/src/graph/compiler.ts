import {
  asModuleInstance,
  normalizeProvider,
  tokenName,
  type ModuleInstance,
  type ModuleTemplate,
} from '../core/index.js'
import {
  compileApplication as compileBaseApplication,
  type ApplicationCompilationInput,
} from './graph.js'
import type {
  ApplicationGraphIR,
  CompilationResult,
  DependencyNodeIR,
  Diagnostic,
  ModuleIR,
} from './ir.js'

export function compileApplication(
  input: ApplicationCompilationInput,
): CompilationResult {
  const base = compileBaseApplication(input)
  const modules = collectModules(input.modules)
  const moduleIds = new Map(
    modules.map((module, index) => [module, `module:${index + 1}`]),
  )
  const implementationModules = collectImplementationModules(modules, moduleIds)
  const implementationNames = new Map(
    base.graph.implementations.map((implementation) => [
      implementation.id,
      implementation.name,
    ]),
  )
  const graphModules = new Map(
    base.graph.modules.map((module) => [module.id, module]),
  )
  const executionModules = new Map<string, string>()

  for (const execution of base.graph.executions) {
    if (execution.kind !== 'protocol') continue
    const implementationName = implementationNames.get(execution.implementation)
    const module = implementationName
      ? implementationModules.get(implementationName)
      : undefined
    if (!module) continue
    executionModules.set(
      `${execution.contract}:${execution.procedure}:${execution.protocol}`,
      module,
    )
  }

  const providerModules = collectProviderModules(modules, moduleIds)
  const nodes = base.graph.nodes.map((node) => {
    const module =
      node.module ??
      providerModules.get(node.label) ??
      moduleForImplementation(node, implementationModules) ??
      moduleForLifecycle(node) ??
      moduleForLayer(node, executionModules)
    if (!module) return node
    const owner = graphModules.get(module)
    if (!owner) return node
    return {
      ...node,
      module,
      visibility: owner.exports.includes(node.label) ? 'exported' : 'private',
    } satisfies DependencyNodeIR
  })

  const diagnostics = [
    ...base.diagnostics,
    ...validateModuleExports(base.graph.modules),
    ...validateModuleVisibility(base.graph, nodes),
  ]
  const graph: ApplicationGraphIR = {
    ...base.graph,
    nodes,
    diagnostics,
  }
  return { graph, diagnostics }
}

export const buildApplicationGraph = compileApplication

function collectModules(
  roots: readonly (ModuleInstance | ModuleTemplate<void>)[],
): ModuleInstance[] {
  const modules: ModuleInstance[] = []
  const seen = new Set<ModuleInstance>()
  const visit = (candidate: ModuleInstance | ModuleTemplate<void>) => {
    const module = asModuleInstance(candidate)
    if (seen.has(module)) return
    seen.add(module)
    for (const imported of module.definition.imports ?? []) visit(imported)
    modules.push(module)
  }
  for (const root of roots) visit(root)
  return modules
}

function collectProviderModules(
  modules: readonly ModuleInstance[],
  moduleIds: ReadonlyMap<ModuleInstance, string>,
): ReadonlyMap<string, string> {
  const result = new Map<string, string>()
  const ambiguous = new Set<string>()
  for (const module of modules) {
    const moduleId = moduleIds.get(module)
    if (!moduleId) continue
    for (const declaration of module.definition.providers ?? []) {
      const provider = normalizeProvider(declaration)
      const labels = [
        tokenName(provider.provide),
        ...(provider.kind === 'class' ? [provider.useClass.name] : []),
        ...(provider.kind === 'conditional'
          ? Reflect.ownKeys(provider.mapping).flatMap((key) => {
              const candidate = provider.mapping[key]
              return candidate ? [candidate.name] : []
            })
          : []),
      ]
      for (const label of labels) {
        const current = result.get(label)
        if (current && current !== moduleId) ambiguous.add(label)
        else result.set(label, moduleId)
      }
    }
  }
  for (const label of ambiguous) result.delete(label)
  return result
}

function collectImplementationModules(
  modules: readonly ModuleInstance[],
  moduleIds: ReadonlyMap<ModuleInstance, string>,
): ReadonlyMap<string, string> {
  const result = new Map<string, string>()
  const ambiguous = new Set<string>()
  for (const module of modules) {
    const moduleId = moduleIds.get(module)
    if (!moduleId) continue
    for (const implementation of module.definition.implementations ?? []) {
      const current = result.get(implementation.name)
      if (current && current !== moduleId) ambiguous.add(implementation.name)
      else result.set(implementation.name, moduleId)
    }
  }
  for (const name of ambiguous) result.delete(name)
  return result
}

function moduleForImplementation(
  node: DependencyNodeIR,
  modules: ReadonlyMap<string, string>,
): string | undefined {
  return node.kind === 'implementation' ? modules.get(node.label) : undefined
}

function moduleForLifecycle(node: DependencyNodeIR): string | undefined {
  if (node.kind !== 'framework' || !node.id.startsWith('lifecycle:module:')) {
    return undefined
  }
  const match = /^lifecycle:(module:\d+):/.exec(node.id)
  return match?.[1]
}

function moduleForLayer(
  node: DependencyNodeIR,
  executionModules: ReadonlyMap<string, string>,
): string | undefined {
  if (node.kind !== 'layer') return undefined
  const match = /^layer:(contract:\d+)\/([^/]+)\/([^/]+)\//.exec(node.id)
  if (!match) return undefined
  const [, contract, procedure, protocol] = match
  return executionModules.get(`${contract}:${procedure}:${protocol}`)
}

function validateModuleExports(modules: readonly ModuleIR[]): Diagnostic[] {
  const byId = new Map(modules.map((module) => [module.id, module]))
  return modules.flatMap((module) =>
    module.exports.flatMap((token) =>
      declaresToken(module, token) ||
      canResolveExport(module, token, byId, new Set())
        ? []
        : [
            {
              code: 'LUTRE_MODULE_EXPORT_UNRESOLVED',
              message: `${describeModule(module)} exports ${token}, but the token is neither declared nor re-exported from an imported Module.`,
              path: `${module.id}.exports.${token}`,
            },
          ],
    ),
  )
}

function declaresToken(module: ModuleIR, token: string): boolean {
  return module.providers.includes(token) || module.environment.includes(token)
}

function canResolveExport(
  source: ModuleIR,
  token: string,
  modules: ReadonlyMap<string, ModuleIR>,
  visited: Set<string>,
): boolean {
  if (visited.has(source.id)) return false
  visited.add(source.id)
  for (const importedId of source.imports) {
    const imported = modules.get(importedId)
    if (!imported || !imported.exports.includes(token)) continue
    if (declaresToken(imported, token)) return true
    if (canResolveExport(imported, token, modules, new Set(visited)))
      return true
  }
  return false
}

function validateModuleVisibility(
  graph: ApplicationGraphIR,
  nodes: readonly DependencyNodeIR[],
): Diagnostic[] {
  const modules = new Map(graph.modules.map((module) => [module.id, module]))
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const seen = new Set<string>()
  const diagnostics: Diagnostic[] = []

  for (const edge of graph.edges) {
    const consumer = nodesById.get(edge.from)
    const dependency = nodesById.get(edge.to)
    if (
      !consumer?.module ||
      !dependency?.module ||
      consumer.module === dependency.module ||
      !modules.has(consumer.module) ||
      !modules.has(dependency.module)
    ) {
      continue
    }
    const key = `${consumer.id}->${dependency.id}`
    if (seen.has(key)) continue
    seen.add(key)
    if (
      isTokenVisibleFrom(
        consumer.module,
        dependency.module,
        dependency.label,
        modules,
      )
    ) {
      continue
    }
    diagnostics.push({
      code: 'LUTRE_MODULE_VISIBILITY',
      message: `${consumer.label} in ${describeModuleId(consumer.module, modules)} depends on private ${dependency.label} from ${describeModuleId(dependency.module, modules)}. Export the dependency and import its Module explicitly.`,
      path: consumer.id,
    })
  }

  return diagnostics
}

function isTokenVisibleFrom(
  sourceId: string,
  targetId: string,
  token: string,
  modules: ReadonlyMap<string, ModuleIR>,
  visited = new Set<string>(),
): boolean {
  if (visited.has(sourceId)) return false
  visited.add(sourceId)
  const source = modules.get(sourceId)
  if (!source) return false

  for (const importedId of source.imports) {
    const imported = modules.get(importedId)
    if (!imported || !imported.exports.includes(token)) continue
    if (importedId === targetId) return true
    if (
      isTokenVisibleFrom(importedId, targetId, token, modules, new Set(visited))
    ) {
      return true
    }
  }
  return false
}

function describeModule(module: ModuleIR): string {
  return module.name ?? module.description ?? module.id
}

function describeModuleId(
  id: string,
  modules: ReadonlyMap<string, ModuleIR>,
): string {
  const module = modules.get(id)
  return module ? describeModule(module) : id
}
