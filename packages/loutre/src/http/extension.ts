import {
  defineExecutionExtension,
  getSourceLocation,
  type ExecutionDefinition,
} from '../core/index.js'
import { match as patternMatch } from 'ts-pattern'
import {
  type CompiledHttpRouteSet,
  type HttpDefinition,
  type CompiledHttpExecution,
} from './compiled.js'
import { compileRawRoute, compileHttpRoute } from './compiler.js'
import { dependencyConsumerId } from '../core/identity.js'
import { HTTP_SERVER } from './capability.js'
import { findHttpRouteConflicts } from './route-validation.js'
import { createHttpExtensionRuntime } from './runtime/dispatch.js'
import { type HttpHostApi, type HttpExtensionRuntime } from './contract.js'

export const httpExecutionExtension = defineExecutionExtension<
  HttpDefinition & ExecutionDefinition,
  CompiledHttpExecution,
  'http',
  HttpHostApi,
  HttpExtensionRuntime
>({
  kind: 'execution-extension',
  abiVersion: '4',
  name: 'loutre:http',
  compile(definition, context) {
    const compiledRoutes = patternMatch(definition.routes)
      .returnType<CompiledHttpRouteSet>()
      .with({ kind: 'raw' }, ({ route }) => ({
        kind: 'raw',
        routes: Object.freeze([compileRawRoute(route)]),
      }))
      .with({ kind: 'contract' }, ({ contract }) => ({
        kind: 'contract',
        routes: Object.freeze(
          Object.entries(contract.routes).flatMap(([name, route]) =>
            route.raw === true
              ? []
              : [compileHttpRoute(name, route, getSourceLocation(contract))],
          ),
        ),
      }))
      .exhaustive()
    const routes = compiledRoutes.routes
    const id =
      definition.name || `${context.moduleId}.http.${context.definitionIndex}`
    const handler = context.compileHandler(definition.handler, {
      kind: 'execution',
      id: dependencyConsumerId(`http:${id}`),
      name: id,
    })
    routes.forEach((route) => {
      route.middlewares.forEach((middleware, index) => {
        context.collectDependencies(
          {
            kind: 'layer',
            id: dependencyConsumerId(`http:${id}:${route.name}:${index}`),
            name: middleware.name,
          },
          () => middleware.factory(),
        )
      })
    })
    return {
      kind: 'execution',
      id,
      executionKind: 'http.request',
      capabilities: [
        ...new Set([
          HTTP_SERVER,
          ...routes.flatMap((route) =>
            route.middlewares.flatMap((middleware) => middleware.capabilities),
          ),
        ]),
      ],
      compiled: Object.freeze({
        ...compiledRoutes,
        handler,
      }),
    }
  },
  validate({ executions }) {
    const routes = executions.flatMap((execution) =>
      execution.compiled.routes.map((route) => ({
        method: route.method,
        path: route.path,
        owner: execution.id,
      })),
    )
    return findHttpRouteConflicts(routes).map(({ existing, route }) => ({
      code: 'LUTRE_HTTP_DUPLICATE_ROUTE',
      message: `${route.method} ${route.path} conflicts with ${existing.owner}.`,
      path: route.owner,
    }))
  },
  createRuntime(context) {
    context.capabilities.get(HTTP_SERVER)
    return createHttpExtensionRuntime(
      context.executions,
      context.applicationRuntime,
    )
  },
  projectGraph: ({ execution }) => ({
    routes: execution.compiled.routes.map((route) => ({
      name: route.name,
      method: route.method,
      path: route.path,
      ...(route.source === undefined ? {} : { source: route.source }),
      middlewares: route.middlewares.map((middleware) => ({
        name: middleware.name,
        capabilities: middleware.capabilities.map(
          (capability) => capability.id,
        ),
        ...(getSourceLocation(middleware) === undefined
          ? {}
          : { source: getSourceLocation(middleware) }),
      })),
      ...patternMatch(route)
        .with({ kind: 'raw' }, ({ protocol }) => ({
          kind: 'raw',
          ...(protocol === undefined ? {} : { protocol }),
        }))
        .with({ kind: 'contract' }, ({ definition }) => ({
          kind: 'contract',
          responses: Object.fromEntries(
            Object.entries(definition.responses).map(([name, response]) => [
              name,
              { status: response.status },
            ]),
          ),
        }))
        .exhaustive(),
    })),
  }),
  host: {
    namespace: 'http',
    create: ({ runtime }) => ({ fetch: (request) => runtime.fetch(request) }),
  },
})
