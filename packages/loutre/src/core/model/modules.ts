import { collectInjectedDependencies } from '../injection.js'
import { diagnostic } from '../diagnostic.js'
import { asModuleInstance } from '../module.js'
import { normalizeProvider, type ProviderDescriptor } from '../provider.js'
import type { TokenLike } from '../token.js'
import { tokenName } from '../token.js'
import type { ProviderModelNode } from './types.js'
import type { ModelBuildContext } from './context.js'
import { appendLifecycleNodes } from './lifecycle.js'
import { snapshotProvider } from './snapshot.js'
import { getSourceLocation } from '../source-location.js'

export function collectModuleDeclarations(context: ModelBuildContext): void {
  const {
    modules,
    moduleIds,
    nodes,
    edges,
    diagnostics,
    providers,
    providerNodes,
  } = context
  const moduleNames = new Set<string>()
  for (const module of modules) {
    const moduleId = moduleIds.get(module)!
    if (module.definition.name) {
      if (moduleNames.has(module.definition.name)) {
        diagnostics.push(
          diagnostic(
            'LUTRE_MODULE_NAME_COLLISION',
            `Module name ${module.definition.name} is already registered.`,
            moduleId,
          ),
        )
      }
      moduleNames.add(module.definition.name)
    }
    const moduleSource = getSourceLocation(module.template)
    nodes.push({
      kind: 'module',
      id: moduleId,
      ...(moduleSource === undefined ? {} : { source: moduleSource }),
      ...(module.definition.name === undefined
        ? {}
        : { name: module.definition.name }),
      ...(module.definition.description === undefined
        ? {}
        : { description: module.definition.description }),
    })
    for (const imported of module.definition.imports ?? []) {
      const target = moduleIds.get(asModuleInstance(imported))
      if (target) edges.push({ from: moduleId, to: target, kind: 'imports' })
    }
    for (const declaration of module.definition.providers ?? []) {
      const normalized = normalizeProvider(declaration)
      const provider = snapshotProvider(normalized)
      const providerSource = getSourceLocation(declaration)
      const providerId = context.nextProviderId()
      const existingProvider = providerNodes.get(provider.provide)
      if (
        existingProvider?.provider.kind === 'environment' &&
        provider.kind === 'environment'
      ) {
        edges.push({ from: moduleId, to: existingProvider.id, kind: 'owns' })
        if (module.definition.exports?.includes(provider.provide)) {
          edges.push({
            from: moduleId,
            to: existingProvider.id,
            kind: 'exports',
          })
        }
        continue
      }
      if (existingProvider) {
        diagnostics.push(
          diagnostic(
            'LUTRE_PROVIDER_DUPLICATE',
            `Provider ${tokenName(provider.provide)} is declared more than once.`,
            providerId,
          ),
        )
        continue
      }
      const node: ProviderModelNode = {
        kind: 'provider',
        id: providerId,
        token: provider.provide,
        provider,
        moduleId,
        dependencies: collectProviderDependencies(provider),
        ...(providerSource === undefined ? {} : { source: providerSource }),
      }
      providers.push(provider)
      providerNodes.set(provider.provide, node)
      nodes.push(node)
      edges.push({ from: moduleId, to: providerId, kind: 'owns' })
      if (module.definition.exports?.includes(provider.provide)) {
        edges.push({ from: moduleId, to: providerId, kind: 'exports' })
      }
    }
    appendLifecycleNodes(module, moduleId, nodes, edges)
  }
}

function collectProviderDependencies(
  provider: ProviderDescriptor,
): readonly TokenLike[] {
  switch (provider.kind) {
    case 'class':
      return Object.freeze(
        collectInjectedDependencies(provider.provide, () =>
          Reflect.construct(provider.useClass, []),
        ),
      )
    case 'factory':
      return Object.freeze([...provider.inject])
    case 'conditional': {
      const dependencies = new Set<TokenLike>()
      for (const implementation of Object.values(provider.mapping)) {
        for (const dependency of collectInjectedDependencies(
          provider.provide,
          () => Reflect.construct(implementation, []),
        )) {
          dependencies.add(dependency)
        }
      }
      return Object.freeze([...dependencies])
    }
    case 'value':
    case 'environment':
    case 'arguments':
      return Object.freeze([])
  }
}
