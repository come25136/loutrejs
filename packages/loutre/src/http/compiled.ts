import {
  type HttpExecutionResponseDefinition,
  type HttpExecutionRouteDefinition,
  type AnyHttpMiddleware,
  type HttpRawRouteDefinition,
  type HttpContract,
} from './contract.js'
import { type Descriptor } from '../internal/brand.js'
import {
  type HttpResponseStatus,
  type HttpProcedureName,
  type HttpMethod,
  type HttpPathTemplate,
  type HttpDispatchKey,
} from './identity.js'
import { type ParsedHttpPath } from './path.js'
import {
  type SourceLocation,
  type ExecutionHandlerSource,
  type ExecutionHandlerResolver,
} from '../core/index.js'

export type CompiledHttpResponseDefinition = HttpExecutionResponseDefinition &
  Descriptor<'http-response'> & { readonly status: HttpResponseStatus }

export type CompiledHttpRouteDefinition = Omit<
  HttpExecutionRouteDefinition,
  'responses'
> & {
  readonly responses: Readonly<Record<string, CompiledHttpResponseDefinition>>
}

interface CompiledHttpRouteBase {
  readonly name: HttpProcedureName
  readonly method: HttpMethod | '*'
  readonly path: HttpPathTemplate
  readonly segments: ParsedHttpPath
  readonly dispatch: HttpDispatchKey
  readonly middlewares: readonly AnyHttpMiddleware[]
  readonly source?: SourceLocation
}

export type CompiledHttpContractRoute = CompiledHttpRouteBase & {
  readonly kind: 'contract'
  readonly definition: CompiledHttpRouteDefinition
}

export type CompiledHttpRawRoute = CompiledHttpRouteBase & {
  readonly kind: 'raw'
  readonly protocol?: string
}

export type CompiledHttpRoute = CompiledHttpContractRoute | CompiledHttpRawRoute

export interface HttpDefinition {
  readonly name: string
  readonly routes:
    | { readonly kind: 'raw'; readonly route: HttpRawRouteDefinition }
    | { readonly kind: 'contract'; readonly contract: HttpContract }
  readonly handler: ExecutionHandlerSource<unknown>
}

export type CompiledHttpRouteSet =
  | { readonly kind: 'raw'; readonly routes: readonly CompiledHttpRawRoute[] }
  | {
      readonly kind: 'contract'
      readonly routes: readonly CompiledHttpContractRoute[]
    }

export type CompiledHttpExecution = CompiledHttpRouteSet & {
  readonly handler: ExecutionHandlerResolver<unknown>
}
