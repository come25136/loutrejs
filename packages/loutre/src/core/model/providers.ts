import { diagnostic } from '../diagnostic.js'
import { argumentsProvider } from '../provider.js'
import { isFrameworkProvidedToken } from '../token-internal.js'
import { tokenName, type TokenLike } from '../token.js'
import type { ProviderModelNode } from './types.js'
import type { ModelBuildContext } from './context.js'
import { snapshotProvider } from './snapshot.js'
import { isTokenVisible, moduleDeclaresToken } from './visibility.js'

export function resolveModuleExports(context: ModelBuildContext): void {
  const { modules, moduleIds, providerNodes, edges, diagnostics } = context
  for (const module of modules) {
    const moduleId = moduleIds.get(module)!
    for (const exported of module.definition.exports ?? []) {
      if (moduleDeclaresToken(module, exported as TokenLike)) continue
      const provider = providerNodes.get(exported as TokenLike)
      const providerModule = provider
        ? modules.find(
            (candidate) => moduleIds.get(candidate) === provider.moduleId,
          )
        : undefined
      if (
        provider &&
        providerModule &&
        isTokenVisible(module, providerModule, exported as TokenLike)
      ) {
        edges.push({ from: moduleId, to: provider.id, kind: 'exports' })
        continue
      }
      diagnostics.push(
        diagnostic(
          'LUTRE_MODULE_EXPORT_UNRESOLVED',
          `Module export ${tokenName(exported as TokenLike)} is neither declared by the Module nor re-exported from an imported Module.`,
          `${moduleId}.exports.${tokenName(exported as TokenLike)}`,
        ),
      )
    }
  }
}

export function compileArgumentsProvider(context: ModelBuildContext): void {
  const { options, providerNodes, diagnostics, providers, nodes } = context
  if (!options.arguments) return
  const existingProvider = providerNodes.get(options.arguments)
  if (existingProvider) {
    diagnostics.push(
      diagnostic(
        'LUTRE_ARGS_001',
        `Arguments ${tokenName(options.arguments)} is runtime-managed and cannot also be declared as a normal provider.`,
        existingProvider.id,
      ),
    )
  }
  const provider = snapshotProvider(argumentsProvider(options.arguments))
  const node: ProviderModelNode = {
    kind: 'provider',
    id: context.nextProviderId(),
    token: options.arguments,
    provider,
    moduleId: 'application',
    dependencies: Object.freeze([]),
  }
  providers.push(provider)
  providerNodes.set(options.arguments, node)
  nodes.push(node)
}

export function resolveProviderDependencies(context: ModelBuildContext): void {
  const { providerNodes, modules, moduleIds, edges, diagnostics } = context
  for (const provider of providerNodes.values()) {
    if (provider.moduleId === 'application') continue
    const sourceModule = modules.find(
      (candidate) => moduleIds.get(candidate) === provider.moduleId,
    )
    if (!sourceModule) continue
    for (const dependency of provider.dependencies) {
      const target = providerNodes.get(dependency)
      if (target) {
        edges.push({ from: provider.id, to: target.id, kind: 'injects' })
        const targetModule = modules.find(
          (candidate) => moduleIds.get(candidate) === target.moduleId,
        )
        if (
          targetModule &&
          target.moduleId !== provider.moduleId &&
          !moduleDeclaresToken(sourceModule, dependency) &&
          !isTokenVisible(sourceModule, targetModule, dependency)
        ) {
          diagnostics.push(
            diagnostic(
              'LUTRE_MODULE_VISIBILITY',
              `Provider ${tokenName(provider.token)} depends on private ${tokenName(dependency)} from another Module.`,
              provider.id,
            ),
          )
        }
      } else if (!isFrameworkProvidedToken(dependency)) {
        diagnostics.push(
          diagnostic(
            'LUTRE_PROVIDER_DEPENDENCY_MISSING',
            `Provider ${tokenName(provider.token)} requires ${tokenName(dependency)}, but no provider is declared.`,
            provider.id,
          ),
        )
      }
    }
  }
}
