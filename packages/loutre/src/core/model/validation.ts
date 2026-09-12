import { diagnostic, type Diagnostic } from '../diagnostic.js'
import type { ExecutionExtension } from '../extension.js'
import type {
  ApplicationModelExtension,
  ApplicationModelNode,
} from './types.js'

export function validateHostNamespaces(
  extensions: readonly ApplicationModelExtension[],
  diagnostics: Diagnostic[],
): void {
  const reserved = new Set([
    'graph',
    'init',
    'get',
    'close',
    'serve',
    'then',
    '__proto__',
    'prototype',
    'constructor',
  ])
  const owners = new Map<string, ExecutionExtension>()
  for (const { extension } of extensions) {
    const namespace = extension.host?.namespace
    if (!namespace) continue
    if (reserved.has(namespace)) {
      diagnostics.push(
        diagnostic(
          'LUTRE_HOST_NAMESPACE_RESERVED',
          `Host namespace ${namespace} is reserved by the Application or runtime adapter API.`,
          `host.${namespace}`,
        ),
      )
      continue
    }
    const owner = owners.get(namespace)
    if (owner && owner.identity !== extension.identity) {
      diagnostics.push(
        diagnostic(
          'LUTRE_HOST_NAMESPACE_COLLISION',
          `Host namespace ${namespace} is contributed by both ${owner.name} and ${extension.name}.`,
          `host.${namespace}`,
        ),
      )
      continue
    }
    owners.set(namespace, extension)
  }
}

export function validateNodeIds(
  nodes: readonly ApplicationModelNode[],
  diagnostics: Diagnostic[],
): void {
  const seen = new Set<string>()
  for (const node of nodes) {
    if (!seen.has(node.id)) {
      seen.add(node.id)
      continue
    }
    diagnostics.push(
      diagnostic(
        'LUTRE_APPLICATION_NODE_ID_COLLISION',
        `Application Model node id ${node.id} is not globally unique.`,
        node.id,
      ),
    )
  }
}
