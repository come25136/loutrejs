import { applicationLoggerNodeId } from './identity.js'
import type { ProviderModelNode } from './types.js'
import { diagnostic } from '../diagnostic.js'
import { Logger } from '../logger.js'
import {
  defaultLoggerProviders,
  defaultLoggerToken,
  isLoggerToken,
} from '../logger-internal.js'
import { tokenName, type TokenLike } from '../token.js'
import type { ModelBuildContext } from './context.js'
import { snapshotProvider } from './snapshot.js'

const loggerNodeId = applicationLoggerNodeId()

export function compileApplicationLogger(context: ModelBuildContext): void {
  const { options, providers, providerNodes, nodes, diagnostics } = context
  if ([...providerNodes.keys()].some(isLoggerToken)) {
    diagnostics.push(
      diagnostic(
        'LUTRE_LOGGER_RESERVED',
        'Logger is a contextual framework token. Declare the root under another token and select it with Application.logger.',
        loggerNodeId,
      ),
    )
  }
  if (options.logger === undefined) {
    for (const declaration of defaultLoggerProviders()) {
      const provider = snapshotProvider(declaration)
      const node: ProviderModelNode = {
        kind: 'provider' as const,
        id: context.nextProviderId(),
        token: provider.provide,
        provider,
        moduleId: 'application',
        dependencies: Object.freeze(
          provider.kind === 'factory' ? [...provider.inject] : [],
        ),
      }
      providers.push(provider)
      providerNodes.set(node.token, node)
      nodes.push(node)
    }
  }
  nodes.push({
    kind: 'framework',
    id: loggerNodeId,
    frameworkKind: 'application-logger',
    name: 'Logger',
  })
  const root = options.logger ?? defaultLoggerToken
  if (typeof root !== 'function' && (!root || root.kind !== 'token')) {
    diagnostics.push(
      diagnostic(
        'LUTRE_LOGGER_TOKEN',
        'Application.logger accepts a Provider token, not a Logger instance.',
        loggerNodeId,
      ),
    )
    return
  }
  const provider = providerNodes.get(root)
  if (!provider) {
    diagnostics.push(
      diagnostic(
        'LUTRE_LOGGER_UNRESOLVED',
        `Application logger ${tokenName(root)} must be declared as a Provider.`,
        loggerNodeId,
      ),
    )
    return
  }
  if (provider.provider.scope !== 'application') {
    diagnostics.push(
      diagnostic(
        'LUTRE_LOGGER_SCOPE',
        'The root Logger must have application scope.',
        provider.id,
      ),
    )
  }
  if (
    options.logger !== undefined &&
    !context.roots.some((module) => module.definition.exports?.includes(root))
  ) {
    diagnostics.push(
      diagnostic(
        'LUTRE_LOGGER_VISIBILITY',
        `Application logger ${tokenName(root)} must be exported by a root Module.`,
        provider.id,
      ),
    )
  }
  context.edges.push({ from: loggerNodeId, to: provider.id, kind: 'injects' })
}

export function connectApplicationLogger(context: ModelBuildContext): void {
  const { nodes, edges, providerNodes, diagnostics, options } = context
  for (const node of nodes) {
    if (
      node.kind !== 'provider' &&
      node.kind !== 'execution' &&
      node.kind !== 'lifecycle'
    )
      continue
    const dependencies =
      node.kind === 'lifecycle' ? node.hook.inject : node.dependencies
    if (dependencies.some(isLoggerToken))
      edges.push({ from: node.id, to: loggerNodeId, kind: 'injects' })
  }
  const root = options.logger ?? defaultLoggerToken
  const visited = new Set<TokenLike>()
  const visit = (token: TokenLike, lineage: readonly TokenLike[]): void => {
    const start = lineage.findIndex(
      (candidate) =>
        candidate === token ||
        (isLoggerToken(candidate) && isLoggerToken(token)),
    )
    if (start >= 0) {
      diagnostics.push(
        diagnostic(
          'LUTRE_LOGGER_CYCLE',
          `Circular Logger dependency: ${[...lineage.slice(start), token].map(tokenName).join(' -> ')}`,
          loggerNodeId,
        ),
      )
      return
    }
    if (visited.has(token)) return
    visited.add(token)
    const dependencies = isLoggerToken(token)
      ? [root]
      : (providerNodes.get(token)?.dependencies ?? [])
    for (const dependency of dependencies)
      visit(dependency, [...lineage, token])
  }
  visit(Logger, [])
}
