import {
  defineExecutionExtension,
  getSourceLocation,
  type ExecutionDefinition,
} from '../core/index.js'
import { compileRouteTree } from './compiler.js'
import { dependencyConsumerId } from '../core/identity.js'
import { WEBSOCKET_SERVER } from './capability.js'
import { type HttpNormalizedPath } from '../http/identity.js'
import { type ExecutionNodeId } from '../core/model/identity.js'
import { createWebSocketRuntime } from './runtime/dispatch.js'
import {
  type WebSocketDefinition,
  type CompiledWebSocketExecution,
} from './compiled.js'
import {
  type WebSocketHostApi,
  type WebSocketExtensionRuntime,
} from './contract.js'

export const websocketExtension = defineExecutionExtension<
  WebSocketDefinition & ExecutionDefinition,
  CompiledWebSocketExecution,
  'websocket',
  WebSocketHostApi,
  WebSocketExtensionRuntime
>({
  kind: 'execution-extension',
  abiVersion: '4',
  name: 'loutre:websocket',
  compile(definition, context) {
    const id =
      definition.name ||
      `${context.moduleId}.websocket.${context.definitionIndex}`
    const routes = compileRouteTree(definition.contract.routes)
    const handler = context.compileHandler(definition.handler, {
      kind: 'execution',
      id: dependencyConsumerId(`websocket:${id}`),
      name: id,
    })
    for (const route of routes) {
      route.handshake?.middlewares?.forEach((middleware, index) => {
        context.collectDependencies(
          {
            kind: 'layer',
            id: dependencyConsumerId(`websocket:${id}:${route.name}:${index}`),
            name: middleware.name,
          },
          () => middleware.factory(),
        )
      })
    }
    return {
      kind: 'execution',
      id,
      executionKind: 'websocket.session',
      capabilities: [
        ...new Set([
          WEBSOCKET_SERVER,
          ...routes.flatMap(
            (route) =>
              route.handshake?.middlewares?.flatMap(
                (middleware) => middleware.capabilities,
              ) ?? [],
          ),
        ]),
      ],
      compiled: Object.freeze({
        routes: Object.freeze(routes),
        handler,
      }),
    }
  },
  validate({ executions }) {
    const paths = new Map<HttpNormalizedPath, ExecutionNodeId>()
    return executions.flatMap((execution) =>
      execution.compiled.routes.flatMap((route) => {
        const owner = paths.get(route.normalizedPath)
        if (owner) {
          return [
            {
              code: 'LUTRE_WEBSOCKET_DUPLICATE_ROUTE',
              message: `${route.path} conflicts with ${owner}.`,
              path: execution.id,
            },
          ]
        }
        paths.set(route.normalizedPath, execution.id)
        return []
      }),
    )
  },
  createRuntime(context) {
    return createWebSocketRuntime(
      context.executions,
      context.capabilities.get(WEBSOCKET_SERVER),
      context.applicationRuntime,
    )
  },
  projectGraph: ({ execution }) => ({
    routes: execution.compiled.routes.map((route) => ({
      name: route.name,
      path: route.path,
      ...(route.handshake?.middlewares?.length
        ? {
            middlewares: route.handshake.middlewares.map((middleware) => ({
              name: middleware.name,
              capabilities: middleware.capabilities.map(
                (capability) => capability.id,
              ),
              ...(getSourceLocation(middleware) === undefined
                ? {}
                : { source: getSourceLocation(middleware) }),
            })),
          }
        : {}),
      ...(route.messages === undefined
        ? {}
        : {
            messages: {
              codec: route.messages.kind,
              input: route.messages.input !== undefined,
              output: route.messages.output !== undefined,
            },
          }),
    })),
  }),
  host: {
    namespace: 'websocket',
    create: ({ runtime }) => ({
      upgrade: (request) => runtime.upgrade(request),
    }),
  },
})
