import {
  type WebSocketRouteTree,
  type WebSocketHandshakeDefinition,
  type WebSocketRouteDefinition,
  type WebSocketBranchDefinition,
} from './contract.js'
import {
  type WebSocketProcedureName,
  webSocketProcedureName,
} from './identity.js'
import {
  parseHttpPath,
  normalizeHttpPath,
  type HttpPathSegment,
} from '../http/path.js'
import { type HttpPathTemplate } from '../http/identity.js'
import { type CompiledWebSocketRoute } from './compiled.js'
import { type StandardSchemaV1 } from '../core/index.js'

export function compileRouteTree(
  tree: WebSocketRouteTree,
  parentPath = '',
  prefix = '',
  routeNames = new Set<WebSocketProcedureName>(),
): readonly CompiledWebSocketRoute[] {
  return Object.entries(tree).flatMap(([name, node]) => {
    if ('request' in node || 'responses' in node)
      throw new TypeError('Use handshake for WebSocket v2 routes.')
    if (isBranch(node)) {
      const branchPath = node.path ?? ''
      if (branchPath !== '') parseHttpPath(branchPath)
      return compileRouteTree(
        node.routes,
        joinPath(parentPath, branchPath),
        prefix ? `${prefix}.${name}` : name,
        routeNames,
      )
    }
    parseHttpPath(node.path)
    const path = joinPath(parentPath, node.path)
    const segments = parseHttpPath(path)
    assertExactPathParams(path, segments, node.handshake?.params)
    const routeName = webSocketProcedureName(
      prefix ? `${prefix}.${name}` : name,
    )
    if (routeNames.has(routeName))
      throw new TypeError(`Duplicate nested WebSocket route name: ${routeName}`)
    routeNames.add(routeName)
    return [
      Object.freeze({
        name: routeName,
        path: path as HttpPathTemplate,
        normalizedPath: normalizeHttpPath(segments),
        segments,
        ...(node.handshake === undefined
          ? {}
          : { handshake: snapshotHandshake(node.handshake) }),
        ...(node.messages === undefined
          ? {}
          : { messages: Object.freeze({ ...node.messages }) }),
      }),
    ]
  })
}

function assertExactPathParams(
  path: string,
  segments: readonly HttpPathSegment[],
  params: Readonly<Record<string, StandardSchemaV1>> | undefined,
): void {
  if (!params) return
  const pathParams = segments
    .flatMap((segment) => (segment.kind === 'param' ? [segment.name] : []))
    .toSorted()
  const schemaParams = Object.keys(params).toSorted()
  if (
    pathParams.length !== schemaParams.length ||
    pathParams.some((name, index) => name !== schemaParams[index])
  ) {
    throw new TypeError(
      `WebSocket ${path} request params must exactly match path parameters.`,
    )
  }
}

function snapshotHandshake(
  handshake: WebSocketHandshakeDefinition,
): WebSocketHandshakeDefinition {
  return Object.freeze({
    ...handshake,
    ...(handshake.middlewares === undefined
      ? {}
      : { middlewares: Object.freeze([...handshake.middlewares]) }),
    ...(handshake.params === undefined
      ? {}
      : { params: Object.freeze({ ...handshake.params }) }),
    ...(handshake.protocols === undefined
      ? {}
      : { protocols: Object.freeze([...handshake.protocols]) }),
  })
}

function isBranch(
  node: WebSocketRouteDefinition | WebSocketBranchDefinition,
): node is WebSocketBranchDefinition {
  return 'routes' in node
}

function joinPath(parent: string, child: string): string {
  if (parent === '') return child || '/'
  if (child === '' || child === '/') return parent
  if (parent === '/') return child
  return `${parent}${child}`
}
