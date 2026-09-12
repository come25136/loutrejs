import { diagnostic } from '../diagnostic.js'
import type { ModuleInstance } from '../module.js'
import { isFrameworkProvidedToken } from '../token-internal.js'
import { tokenName } from '../token.js'
import type {
  ApplicationModelEdge,
  ApplicationModelNode,
  LifecycleModelNode,
} from './types.js'
import type { ModelBuildContext } from './context.js'
import { snapshotLifecycleHook } from './snapshot.js'
import { isTokenVisible, moduleDeclaresToken } from './visibility.js'

export function appendLifecycleNodes(
  module: ModuleInstance,
  moduleId: string,
  nodes: ApplicationModelNode[],
  edges: ApplicationModelEdge[],
): void {
  const lifecycle = module.definition.lifecycle
  if (!lifecycle) return
  for (const [phase, hook] of Object.entries(lifecycle)) {
    const id = `lifecycle:${moduleId}:${phase}`
    nodes.push({
      kind: 'lifecycle',
      id,
      moduleId,
      phase,
      hook: snapshotLifecycleHook(hook),
    })
    edges.push({ from: moduleId, to: id, kind: 'owns' })
  }
}

export function resolveLifecycleDependencies(context: ModelBuildContext): void {
  const { nodes, providerNodes, modules, moduleIds, edges, diagnostics } =
    context
  for (const lifecycle of nodes.filter(
    (node): node is LifecycleModelNode => node.kind === 'lifecycle',
  )) {
    for (const dependency of lifecycle.hook.inject) {
      const provider = providerNodes.get(dependency)
      if (provider) {
        edges.push({ from: lifecycle.id, to: provider.id, kind: 'injects' })
        const sourceModule = modules.find(
          (candidate) => moduleIds.get(candidate) === lifecycle.moduleId,
        )
        const providerModule = modules.find(
          (candidate) => moduleIds.get(candidate) === provider.moduleId,
        )
        if (
          sourceModule &&
          providerModule &&
          provider.moduleId !== lifecycle.moduleId &&
          !moduleDeclaresToken(sourceModule, dependency) &&
          !isTokenVisible(sourceModule, providerModule, dependency)
        ) {
          diagnostics.push(
            diagnostic(
              'LUTRE_MODULE_VISIBILITY',
              `Lifecycle ${lifecycle.phase} depends on private ${tokenName(dependency)} from another Module.`,
              lifecycle.id,
            ),
          )
        }
      } else if (!isFrameworkProvidedToken(dependency)) {
        diagnostics.push(
          diagnostic(
            'LUTRE_LIFECYCLE_DEPENDENCY_MISSING',
            `Lifecycle ${lifecycle.phase} requires ${tokenName(dependency)}, but no provider is declared.`,
            lifecycle.id,
          ),
        )
      }
    }
  }
}
