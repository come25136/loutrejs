import { diagnostic } from '../diagnostic.js'
import { LoggerToken } from '../logger.js'
import { defaultLoggerProviders, isLoggerToken } from '../logger-internal.js'
import { tokenName, type TokenLike } from '../token.js'
import { findProviderNode, type ModelBuildContext } from './context.js'
import { collectProviderDependencies } from './modules.js'
import type { ProviderModelNode } from './types.js'
import { snapshotProvider } from './snapshot.js'

export function compileApplicationLogger(context: ModelBuildContext): void {
  const { providers, providerNodes, nodes, diagnostics } = context
  let root = findProviderNode(context, LoggerToken)
  if (!root) {
    for (const declaration of defaultLoggerProviders()) {
      const provider = snapshotProvider(declaration)
      const node: ProviderModelNode = {
        kind: 'provider',
        id: context.nextProviderId(),
        token: provider.provide,
        provider,
        moduleId: 'application',
        dependencies: collectProviderDependencies(provider),
      }
      providers.push(provider)
      providerNodes.set(node.token, node)
      nodes.push(node)
    }
    root = findProviderNode(context, LoggerToken)
  }
  if (!root) return
  if (root.provider.scope !== 'application') {
    diagnostics.push(
      diagnostic(
        'LUTRE_LOGGER_SCOPE',
        'LoggerToken must have application scope.',
        root.id,
      ),
    )
  }
  if (
    root.moduleId !== 'application' &&
    !context.roots.some((module) =>
      module.definition.exports?.some(isLoggerToken),
    )
  ) {
    diagnostics.push(
      diagnostic(
        'LUTRE_LOGGER_VISIBILITY',
        'LoggerToken must be exported by a root Module to configure the Application logger.',
        root.id,
      ),
    )
  }
}

export function validateApplicationLogger(context: ModelBuildContext): void {
  const root = findProviderNode(context, LoggerToken)
  if (!root) return
  const visited = new Set<TokenLike>()
  const visit = (token: TokenLike, lineage: readonly TokenLike[]): void => {
    const canonical = isLoggerToken(token) ? root.token : token
    const start = lineage.indexOf(canonical)
    if (start >= 0) {
      context.diagnostics.push(
        diagnostic(
          'LUTRE_LOGGER_CYCLE',
          `Circular Logger dependency: ${[...lineage.slice(start), canonical].map(tokenName).join(' -> ')}`,
          root.id,
        ),
      )
      return
    }
    if (visited.has(canonical)) return
    visited.add(canonical)
    for (const dependency of findProviderNode(context, canonical)
      ?.dependencies ?? []) {
      visit(dependency, [...lineage, canonical])
    }
  }
  visit(root.token, [])
}
