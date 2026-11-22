import { basicAuth, bearerAuth } from './auth.js'
import { cors } from './cors.js'
import {
  type ExecutionDefinition,
  type DeclaredExecutionMethods,
  defineExecution,
  type ExecutionDelegation,
  inheritSourceLocation,
  type Type,
  defineLayer,
} from '../core/index.js'
import { httpExecutionExtension } from './extension.js'
import {
  type HttpRawDefinition,
  type AnyHttpMiddleware,
  type HttpRawRouteDefinition,
  type HttpRawDelegatedDefinition,
  type HttpContract,
  type HttpImplementationDefinition,
  type IsHttpContractTreeInheritanceValid,
  type ResolvedHttpContractRoutes,
  type HttpContractRouteTree,
  httpContractBrand,
  type HttpContractRouteDefinition,
  type HttpExecutionResponseDefinition,
  type HttpHandlers,
  type HttpMiddleware,
  type HttpMiddlewareContext,
  type HttpMiddlewareOutcome,
  type HttpValidationMiddleware,
} from './contract.js'
import {
  type HttpDefinition,
  compiledContractRoutes,
  isCompiledHttpContract,
  type CompiledHttpContract,
  type CompiledHttpContractRoute,
} from './compiled.js'
import { type HttpContractConstraint } from './constraints.js'
import { snapshotHttpContractRawRoute, compileHttpRoute } from './compiler.js'
import { parseHttpPath } from './path.js'
import { isWebSocketUpgrade } from './websocket-upgrade.js'
import { httpError } from './result.js'
import { HTTP_SERVER, bindHttpServer } from './capability.js'

export type HttpRawExecutionDefinition = ExecutionDefinition<
  typeof httpExecutionExtension
>

export function defineHttpRaw<
  const TMiddlewares extends readonly AnyHttpMiddleware[] = readonly [],
>(
  definition: HttpRawDefinition<TMiddlewares>,
): HttpRawDefinition<TMiddlewares> & HttpRawExecutionDefinition

export function defineHttpRaw(definition: {
  readonly name?: string
  readonly route: HttpRawRouteDefinition
  readonly factory: () => unknown
}): HttpRawExecutionDefinition {
  return defineExecution(httpExecutionExtension, {
    ...definition,
    name: definition.name ?? '',
    routes: { kind: 'raw', route: definition.route },
    handler: { kind: 'factory', factory: definition.factory },
  } satisfies HttpDefinition)
}

export function defineHttpDelegate<
  const TMiddlewares extends readonly AnyHttpMiddleware[] = readonly [],
>(
  definition: HttpRawDelegatedDefinition<TMiddlewares>,
): HttpRawDelegatedDefinition<TMiddlewares> & HttpRawExecutionDefinition

export function defineHttpDelegate(definition: {
  readonly name?: string
  readonly route: HttpRawRouteDefinition
  readonly delegate: ExecutionDelegation<unknown>
}): HttpRawExecutionDefinition {
  return defineExecution(httpExecutionExtension, {
    ...definition,
    name: definition.name ?? '',
    routes: { kind: 'raw', route: definition.route },
    handler: { kind: 'delegate', delegate: definition.delegate },
  } satisfies HttpDefinition)
}

export type HttpExecutionDefinition<
  TContract extends HttpContract = HttpContract,
> = HttpImplementationDefinition<TContract> &
  ExecutionDefinition<typeof httpExecutionExtension>

export function defineHttpContract<const TTree extends HttpContractRouteTree>(
  routes: TTree &
    (Extract<
      keyof ResolvedHttpContractRoutes<TTree>,
      'kind' | 'routes'
    > extends never
      ? unknown
      : never) &
    (IsHttpContractTreeInheritanceValid<TTree> extends true ? unknown : never) &
    (ResolvedHttpContractRoutes<TTree> extends HttpContractConstraint<
      ResolvedHttpContractRoutes<TTree>
    >
      ? unknown
      : never),
): HttpContract<ResolvedHttpContractRoutes<TTree>>

export function defineHttpContract(
  routes: HttpContractRouteTree,
): CompiledHttpContract {
  const resolvedRoutes = resolveHttpContractRoutes(routes)
  const compiled: CompiledHttpContractRoute[] = []
  const canonicalRoutes = Object.fromEntries(
    Object.entries(resolvedRoutes).map(([name, route]) => {
      if (name === 'kind' || name === 'routes')
        throw new TypeError(`Reserved HTTP operation name: ${name}`)
      if (route.raw === true)
        return [name, snapshotHttpContractRawRoute(route)] as const
      const operation = compileHttpRoute(name, route)
      compiled.push(operation)
      return [name, operation.definition] as const
    }),
  )
  const contract = {
    ...Object.fromEntries(
      compiled.map((route) => [route.name, route.definition.responses]),
    ),
    [compiledContractRoutes]: Object.freeze(compiled),
    kind: 'http-contract' as const,
    [httpContractBrand]: true as const,
    routes: Object.freeze(canonicalRoutes),
  }
  Object.defineProperties(contract, {
    [httpContractBrand]: { enumerable: false },
    [compiledContractRoutes]: { enumerable: false },
  })
  return Object.freeze(contract)
}

function resolveHttpContractRoutes(
  tree: HttpContractRouteTree,
): Record<string, HttpContractRouteDefinition> {
  const resolved: Record<string, HttpContractRouteDefinition> =
    Object.create(null)

  const visit = (
    current: HttpContractRouteTree,
    pathPrefix: string,
    inheritedResponses: Readonly<
      Record<string, HttpExecutionResponseDefinition>
    >,
    inheritedMiddlewares: readonly AnyHttpMiddleware[],
  ) => {
    for (const [name, node] of Object.entries(current)) {
      if ('method' in node) {
        if ('routes' in node) {
          throw new TypeError(
            `HTTP Contract node ${name} must be either a branch or a leaf route.`,
          )
        }
        if (Object.hasOwn(resolved, name)) {
          throw new TypeError(`Duplicate nested HTTP route name: ${name}`)
        }
        if (node.raw === true) {
          if (
            node.responses !== undefined ||
            node.request !== undefined ||
            Object.keys(inheritedResponses).length > 0
          )
            throw new TypeError(
              'Raw routes cannot declare or inherit HTTP request schemas or responses.',
            )
          resolved[name] = inheritSourceLocation(
            {
              ...node,
              path: joinHttpPath(pathPrefix, node.path),
              ...(inheritedMiddlewares.length === 0 && !node.middlewares
                ? {}
                : {
                    middlewares: [
                      ...inheritedMiddlewares,
                      ...(node.middlewares ?? []),
                    ],
                  }),
            },
            node,
          )
          continue
        } else {
          assertValidResponseNames(name, inheritedResponses, node.responses)
        }
        resolved[name] = inheritSourceLocation(
          {
            ...node,
            path: joinHttpPath(pathPrefix, node.path),
            responses: { ...inheritedResponses, ...node.responses },
            ...(inheritedMiddlewares.length === 0 && !node.middlewares
              ? {}
              : {
                  middlewares: [
                    ...inheritedMiddlewares,
                    ...(node.middlewares ?? []),
                  ],
                }),
          },
          node,
        )
        continue
      }
      if (!('routes' in node)) {
        throw new TypeError(
          `HTTP Contract node ${name} must declare method or routes.`,
        )
      }
      const branchPath = node.path ?? ''
      if (branchPath !== '') parseHttpPath(branchPath)
      assertValidResponseNames(name, inheritedResponses, node.responses ?? {})
      visit(
        node.routes,
        joinHttpPath(pathPrefix, branchPath),
        { ...inheritedResponses, ...node.responses },
        [...inheritedMiddlewares, ...(node.middlewares ?? [])],
      )
    }
  }

  visit(tree, '', {}, [])
  return resolved
}

function joinHttpPath(prefix: string, path: string): string {
  if (prefix === '') return path
  if (prefix === '/') return path
  if (path === '/') return prefix
  return `${prefix}${path}`
}

function assertValidResponseNames(
  nodeName: string,
  inherited: Readonly<Record<string, HttpExecutionResponseDefinition>>,
  declared: Readonly<Record<string, HttpExecutionResponseDefinition>>,
): void {
  if (Object.getOwnPropertySymbols(declared).length > 0)
    throw new TypeError(`HTTP response names at ${nodeName} must be strings.`)
  for (const name of Object.keys(declared)) {
    if (Object.hasOwn(inherited, name)) {
      throw new TypeError(
        `Duplicate inherited HTTP response ${name} at ${nodeName}.`,
      )
    }
  }
}

export function defineHttpImplementation<
  const TContract extends HttpContract,
  const THandlers extends object = {},
>(definition: {
  readonly name?: string
  readonly contract: TContract
  readonly factory: () => HttpHandlers<TContract> &
    THandlers &
    NoInfer<DeclaredExecutionMethods<THandlers, HttpHandlers<TContract>>>
}): HttpExecutionDefinition<TContract>

export function defineHttpImplementation(definition: {
  readonly name?: string
  readonly contract: HttpContract
  readonly factory: () => unknown
}): ExecutionDefinition<typeof httpExecutionExtension> {
  if (!isCompiledHttpContract(definition.contract))
    throw new TypeError(
      'http.implementation() requires a Contract created by http.contract().',
    )
  return defineExecution(httpExecutionExtension, {
    ...definition,
    name: definition.name ?? '',
    routes: { kind: 'contract', contract: definition.contract },
    handler: { kind: 'factory', factory: definition.factory },
  } satisfies HttpDefinition)
}

export function defineHttpMiddleware<
  TContribution extends object = {},
>(definition: {
  readonly name: string
  readonly state?: Type<TContribution>
  readonly factory: HttpMiddleware<NoInfer<TContribution>>['factory']
}): HttpMiddleware<TContribution> {
  return defineLayer<
    TContribution,
    HttpMiddlewareContext,
    HttpMiddlewareOutcome
  >(definition)
}

const bodyValidation = Object.freeze({
  kind: 'http-validation' as const,
  part: 'body' as const,
}) satisfies HttpValidationMiddleware<'body'>

export const validate = Object.freeze({
  body: bodyValidation,
})

export const executionHttp = Object.freeze({
  isWebSocketUpgrade,
  basicAuth,
  bearerAuth,
  cors,
  raw: defineHttpRaw,
  delegate: defineHttpDelegate,
  contract: defineHttpContract,
  implementation: defineHttpImplementation,
  middleware: defineHttpMiddleware,
  validate,
  error: httpError,
  extension: httpExecutionExtension,
  serverCapability: HTTP_SERVER,
  bindServer: bindHttpServer,
})
