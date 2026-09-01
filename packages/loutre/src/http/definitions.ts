import type {
  ContractDefinition,
  ResolvedContractNode,
  ContextProvidedBeforeTerminal,
  HasValidationBeforeTerminal,
  IsValidProtocolPipeline,
  PipelineItem,
  ProcedureDefinition,
  ProtocolDescriptor,
  ProtocolFactory,
  ProtocolGroup,
  SchemaInput,
  SchemaOutput,
  ShortCircuitDeclarationsOf,
  ShortCircuitResultOf,
  StandardSchemaV1,
  TerminalLayerDescriptor,
  ValidationLayerDescriptor,
} from '../core/index.js'
import { childPipelineOf } from '../core/index.js'
import {
  contractNodeBinding,
  contractNodeMetadata,
  protocolNamespaceBuilder,
  protocolNamespaceType,
} from '../core/contract-internal.js'
import { httpNodeMetadata } from './internal.js'
import type { Logger } from '../runtime/index.js'
import {
  createHttpDispatchKey,
  type HttpDispatchKey,
  type IsValidHttpPath,
  type PathParamNames,
  parseHttpPath,
  type RawPathParams,
} from './path.js'

export type HttpParamsSchemas = Readonly<Record<string, StandardSchemaV1>>

export interface HttpRequestBodyDefinition<
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> {
  readonly contentType: string
  readonly schema: TSchema
}

export interface HttpRequestDefinition {
  readonly params?: HttpParamsSchemas
  readonly query?: StandardSchemaV1
  readonly headers?: StandardSchemaV1
  readonly body?: HttpRequestBodyDefinition
}

export type HttpHeaderValue = string | readonly string[]
export type HttpHeaders = Readonly<Record<string, HttpHeaderValue | undefined>>

export interface HttpErrorMatcher<TError extends { readonly data: unknown }> {
  is(error: unknown): error is TError
}

export interface HttpErrorMapping<
  TError extends { readonly data: unknown } = { readonly data: unknown },
  TResult = unknown,
> {
  readonly kind: 'http-error-mapping'
  readonly definition: HttpErrorMatcher<TError>
  readonly map: (error: TError) => TResult | Promise<TResult>
}

export interface HttpResponseDefinition {
  readonly status: number
  readonly description?: string
  readonly body: StandardSchemaV1
  readonly headers?: StandardSchemaV1
  readonly staticHeaders?: HttpHeaders
  readonly error?: HttpErrorMapping<any, any>
  readonly stream?: 'server'
}

export interface HttpProtocolDefinition {
  readonly method: string
  readonly path: string
  readonly summary?: string
  readonly description?: string
  readonly tags?: readonly string[]
  readonly deprecated?: boolean
  readonly request?: HttpRequestDefinition
  readonly responses: Readonly<Record<string, HttpResponseDefinition>>
  readonly pipeline: readonly PipelineItem[]
  readonly interaction?: 'unary' | 'server-stream'
}

export interface HttpBranchDefinition {
  readonly path?: string
  readonly pipeline?: readonly PipelineItem[]
  readonly responses?: Readonly<Record<string, HttpResponseDefinition>>
  readonly routes: HttpRouteTree
}

export type HttpRouteTree = Readonly<
  Record<
    string,
    HttpProtocolDefinition | HttpBranchDefinition | HttpResolvedNode
  >
>

interface HttpResolvedNodeMetadata<
  TSource extends HttpProtocolDefinition | HttpBranchDefinition =
    | HttpProtocolDefinition
    | HttpBranchDefinition,
  THandlerName extends string | never = string | never,
> {
  readonly kind: 'leaf' | 'branch'
  readonly source: TSource
  readonly handlerName: THandlerName
}

export type HttpResolvedLeaf<
  THandlerName extends string = string,
  TSource extends HttpProtocolDefinition = HttpProtocolDefinition,
  TEffective extends HttpProtocolDefinition = HttpProtocolDefinition,
> = ResolvedContractNode<
  ContractDefinition<{
    readonly [K in THandlerName]: {
      readonly kind: 'procedure'
      readonly protocols: { readonly http: HttpProtocol<TEffective> }
    }
  }>
> & {
  readonly [httpNodeMetadata]: HttpResolvedNodeMetadata<
    TSource,
    THandlerName
  > & { readonly kind: 'leaf' }
}

type ResolvedContractOf<TNode> =
  TNode extends ResolvedContractNode<infer TContract> ? TContract : never

type HttpProtocolOfResolvedLeaf<TNode> =
  ResolvedContractOf<TNode> extends ContractDefinition<infer TProcedures>
    ? TProcedures[keyof TProcedures & string]['protocols'] extends {
        readonly http: infer TProtocol extends ProtocolDescriptor<'http'>
      }
      ? TProtocol
      : never
    : never

type FlatResolvedHttpProcedures<
  TChildren extends Readonly<Record<string, unknown>>,
  TPrefix extends string = '',
> =
  UnionToIntersection<
    {
      [K in keyof TChildren & string]: TChildren[K] extends HttpResolvedLeaf<
        any,
        any,
        any
      >
        ? {
            readonly [P in JoinProcedurePath<TPrefix, K>]: ProcedureDefinition<{
              readonly http: HttpProtocolOfResolvedLeaf<TChildren[K]>
            }>
          }
        : TChildren[K] extends HttpResolvedBranch<any, infer TGrandchildren>
          ? FlatResolvedHttpProcedures<
              TGrandchildren,
              JoinProcedurePath<TPrefix, K>
            >
          : never
    }[keyof TChildren & string]
  > extends infer TProcedures extends Record<string, ProcedureDefinition>
    ? TProcedures
    : never

export type HttpResolvedBranch<
  TSource extends HttpBranchDefinition = HttpBranchDefinition,
  TChildren extends Readonly<Record<string, HttpResolvedNode>> = Readonly<
    Record<string, HttpResolvedNode>
  >,
> = ResolvedContractNode<
  ContractDefinition<FlatResolvedHttpProcedures<TChildren>>
> &
  TChildren & {
    readonly [httpNodeMetadata]: HttpResolvedNodeMetadata<TSource, never> & {
      readonly kind: 'branch'
    }
  }

export type HttpResolvedNode = ResolvedContractNode & {
  readonly [httpNodeMetadata]: HttpResolvedNodeMetadata
}

type SourceOfHttpNode<TNode> = TNode extends {
  readonly [httpNodeMetadata]: HttpResolvedNodeMetadata<infer TSource, any>
}
  ? TSource
  : TNode

type HandlerNameOfHttpNode<TName extends string, TNode> = TNode extends {
  readonly [httpNodeMetadata]: HttpResolvedNodeMetadata<any, infer THandlerName>
}
  ? [THandlerName] extends [never]
    ? TName
    : THandlerName & string
  : TName

type BranchPathOf<TBranch extends HttpBranchDefinition> = TBranch extends {
  readonly path: infer TPath extends string
}
  ? TPath
  : ''

type BranchPipelineOf<TBranch extends HttpBranchDefinition> = TBranch extends {
  readonly pipeline: infer TPipeline extends readonly PipelineItem[]
}
  ? TPipeline
  : readonly []

type BranchResponsesOf<TBranch extends HttpBranchDefinition> = TBranch extends {
  readonly responses: infer TResponses extends Readonly<
    Record<string, HttpResponseDefinition>
  >
}
  ? TResponses
  : {}

type JoinHttpPath<
  TParent extends string,
  TChild extends string,
> = TParent extends ''
  ? TChild
  : TChild extends '/'
    ? TParent
    : `${TParent}${TChild}`

type MergeHttpResponses<
  TParent extends Readonly<Record<string, HttpResponseDefinition>>,
  TLocal extends Readonly<Record<string, HttpResponseDefinition>>,
> =
  Extract<keyof TParent, keyof TLocal> extends never ? TParent & TLocal : never

type EffectiveHttpDefinition<
  TDefinition extends HttpProtocolDefinition,
  TParentPath extends string,
  TParentPipeline extends readonly PipelineItem[],
  TParentResponses extends Readonly<Record<string, HttpResponseDefinition>>,
> = {
  readonly method: TDefinition['method']
  readonly path: JoinHttpPath<TParentPath, TDefinition['path']>
  readonly responses: MergeHttpResponses<
    TParentResponses,
    TDefinition['responses']
  >
  readonly pipeline: readonly [...TParentPipeline, ...TDefinition['pipeline']]
} & (TDefinition extends { readonly summary: infer TValue extends string }
  ? { readonly summary: TValue }
  : {}) &
  (TDefinition extends { readonly description: infer TValue extends string }
    ? { readonly description: TValue }
    : {}) &
  (TDefinition extends { readonly tags: infer TValue extends readonly string[] }
    ? { readonly tags: TValue }
    : {}) &
  (TDefinition extends { readonly deprecated: infer TValue extends boolean }
    ? { readonly deprecated: TValue }
    : {}) &
  (TDefinition extends {
    readonly request: infer TValue extends HttpRequestDefinition
  }
    ? { readonly request: TValue }
    : {}) &
  (TDefinition extends {
    readonly interaction: infer TValue extends 'unary' | 'server-stream'
  }
    ? { readonly interaction: TValue }
    : {})

type ResolvedHttpTree<
  TTree extends Readonly<Record<string, unknown>>,
  TParentPath extends string = '',
  TParentPipeline extends readonly PipelineItem[] = readonly [],
  TParentResponses extends Readonly<Record<string, HttpResponseDefinition>> =
    {},
> = {
  readonly [K in keyof TTree]: ResolveHttpNode<
    K & string,
    TTree[K],
    TParentPath,
    TParentPipeline,
    TParentResponses
  >
}

type ResolveHttpNode<
  TName extends string,
  TNode,
  TParentPath extends string,
  TParentPipeline extends readonly PipelineItem[],
  TParentResponses extends Readonly<Record<string, HttpResponseDefinition>>,
> =
  SourceOfHttpNode<TNode> extends infer TSource
    ? TSource extends HttpProtocolDefinition
      ? HttpResolvedLeaf<
          HandlerNameOfHttpNode<TName, TNode>,
          TSource,
          EffectiveHttpDefinition<
            TSource,
            TParentPath,
            TParentPipeline,
            TParentResponses
          >
        >
      : TSource extends HttpBranchDefinition
        ? HttpResolvedBranch<
            TSource,
            ResolvedHttpTree<
              TSource['routes'],
              JoinHttpPath<TParentPath, BranchPathOf<TSource>>,
              readonly [...TParentPipeline, ...BranchPipelineOf<TSource>],
              MergeHttpResponses<TParentResponses, BranchResponsesOf<TSource>>
            >
          >
        : never
    : never

type JoinProcedurePath<
  TPrefix extends string,
  TName extends string,
> = TPrefix extends '' ? TName : `${TPrefix}.${TName}`

type UnionToIntersection<T> = (
  T extends unknown ? (value: T) => void : never
) extends (value: infer TIntersection) => void
  ? TIntersection
  : never

type FlatHttpProtocols<
  TTree extends Readonly<Record<string, unknown>>,
  TParentPath extends string = '',
  TParentPipeline extends readonly PipelineItem[] = readonly [],
  TParentResponses extends Readonly<Record<string, HttpResponseDefinition>> =
    {},
  TProcedurePrefix extends string = '',
  TRootTree extends Readonly<Record<string, unknown>> = TTree,
> = UnionToIntersection<
  {
    [K in keyof TTree & string]: SourceOfHttpNode<
      TTree[K]
    > extends infer TSource
      ? TSource extends HttpProtocolDefinition
        ? {
            readonly [
              P in JoinProcedurePath<TProcedurePrefix, K>
            ]: HttpProtocol<
              EffectiveHttpDefinition<
                TSource,
                TParentPath,
                TParentPipeline,
                TParentResponses
              >,
              ResolvedHttpTree<TRootTree>
            >
          }
        : TSource extends HttpBranchDefinition
          ? FlatHttpProtocols<
              TSource['routes'],
              JoinHttpPath<TParentPath, BranchPathOf<TSource>>,
              readonly [...TParentPipeline, ...BranchPipelineOf<TSource>],
              MergeHttpResponses<TParentResponses, BranchResponsesOf<TSource>>,
              JoinProcedurePath<TProcedurePrefix, K>,
              TRootTree
            >
          : never
      : never
  }[keyof TTree & string]
>

export interface HttpProtocol<
  TDefinition extends HttpProtocolDefinition = HttpProtocolDefinition,
  TNamespace = unknown,
> extends ProtocolDescriptor<
  'http',
  HttpControllerContextDefinition<TDefinition>,
  DeclaredHttpResults<TDefinition['responses']>,
  HttpDispatchKey<TDefinition['method'], TDefinition['path']>
> {
  readonly definition: TDefinition
  readonly [protocolNamespaceType]: TNamespace
  readonly interaction: TDefinition extends {
    readonly interaction: infer TInteraction
  }
    ? TInteraction & ('unary' | 'server-stream')
    : 'unary'
}

const controller: TerminalLayerDescriptor<'http'> = Object.freeze({
  kind: 'terminal',
  name: 'http.controller',
  role: 'terminal',
  protocol: 'http',
})

type IsHttpPipelineCompatible<
  TPipeline extends readonly PipelineItem[],
  TResponses extends HttpProtocolDefinition['responses'],
> = number extends TPipeline['length']
  ? false
  : TPipeline extends readonly [infer THead, ...infer TTail]
    ? IsLayerShortCircuitCompatible<
        ShortCircuitResultOf<THead>,
        TResponses
      > extends true
      ? IsShortCircuitDeclarationsCompatible<
          ShortCircuitDeclarationsOf<THead>,
          TResponses
        > extends true
        ? IsHttpPipelineCompatible<
            Extract<TTail, readonly PipelineItem[]>,
            TResponses
          >
        : false
      : false
    : true

type IsAny<T> = 0 extends 1 & T ? true : false

type IsUnknown<T> = unknown extends T
  ? [keyof T] extends [never]
    ? true
    : false
  : false

type ResponseBodyOutput<TResponse extends HttpResponseDefinition> =
  TResponse extends { readonly stream: 'server' }
    ? AsyncIterable<SchemaOutput<TResponse['body']>>
    : SchemaOutput<TResponse['body']>

type ResponseHeadersOutput<TResponse extends HttpResponseDefinition> =
  TResponse extends {
    readonly headers: infer THeaders extends StandardSchemaV1
  }
    ? SchemaOutput<THeaders>
    : never

type DeclaredHttpResults<
  TResponses extends HttpProtocolDefinition['responses'],
> = string extends keyof TResponses
  ? LogicalHttpResult
  : {
      [TVariant in keyof TResponses & string]: NonNullable<
        TResponses[TVariant]
      > extends infer TResponse extends HttpResponseDefinition
        ? LogicalHttpResult<
            TVariant,
            ResponseBodyOutput<TResponse>,
            ResponseHeadersOutput<TResponse>
          >
        : never
    }[keyof TResponses & string]

type IsResultHeadersCompatible<
  TResult,
  TResponses extends HttpProtocolDefinition['responses'],
> = string extends keyof TResponses
  ? true
  : TResult extends {
        readonly variant: infer TVariant extends keyof TResponses
      }
    ? TResult extends { readonly headers: infer TResultHeaders }
      ? NonNullable<TResponses[TVariant]> extends infer TResponse extends
          HttpResponseDefinition
        ? [ResponseHeadersOutput<TResponse>] extends [never]
          ? false
          : Exclude<
                keyof TResultHeaders,
                keyof NonNullable<ResponseHeadersOutput<TResponse>>
              > extends never
            ? true
            : false
        : false
      : true
    : false

type AreResultHeadersCompatible<
  TResult,
  TResponses extends HttpProtocolDefinition['responses'],
> = false extends (
  TResult extends unknown
    ? IsResultHeadersCompatible<TResult, TResponses>
    : never
)
  ? false
  : true

type IsLayerShortCircuitCompatible<
  TResult,
  TResponses extends HttpProtocolDefinition['responses'],
> =
  IsAny<TResult> extends true
    ? true
    : IsUnknown<TResult> extends true
      ? true
      : [TResult] extends [never]
        ? true
        : [TResult] extends [DeclaredHttpResults<TResponses>]
          ? AreResultHeadersCompatible<TResult, TResponses>
          : false

type IsShortCircuitDeclarationsCompatible<
  TDeclarations,
  TResponses extends HttpProtocolDefinition['responses'],
> =
  IsAny<TDeclarations> extends true
    ? true
    : IsUnknown<TDeclarations> extends true
      ? true
      : TDeclarations extends readonly unknown[]
        ? number extends TDeclarations['length']
          ? true
          : TDeclarations extends readonly [infer THead, ...infer TTail]
            ? IsHttpShortCircuitDeclarationCompatible<
                THead,
                TResponses
              > extends true
              ? IsShortCircuitDeclarationsCompatible<TTail, TResponses>
              : false
            : true
        : true

type IsHttpShortCircuitDeclarationCompatible<
  TDeclaration,
  TResponses extends HttpProtocolDefinition['responses'],
> = TDeclaration extends {
  readonly protocol: 'http'
  readonly variant: infer TVariant extends string
}
  ? string extends TVariant
    ? true
    : TVariant extends keyof TResponses
      ? NonNullable<TResponses[TVariant]> extends HttpResponseDefinition
        ? TDeclaration extends {
            readonly response: { readonly status: infer TStatus extends number }
          }
          ? NonNullable<TResponses[TVariant]>['status'] extends TStatus
            ? true
            : number extends NonNullable<TResponses[TVariant]>['status']
              ? true
              : false
          : true
        : false
      : false
  : true

type HttpPipelineConstraint<TDefinition extends HttpProtocolDefinition> =
  IsValidProtocolPipeline<TDefinition['pipeline'], 'http'> extends true
    ? IsHttpPipelineCompatible<
        TDefinition['pipeline'],
        TDefinition['responses']
      > extends true
      ? unknown
      : { readonly pipeline: never }
    : { readonly pipeline: never }

type IsResponseHeadersSchemaCompatible<TResponse> =
  TResponse extends HttpResponseDefinition
    ? TResponse extends {
        readonly headers: infer THeaders extends StandardSchemaV1
      }
      ? SchemaOutput<THeaders> extends HttpHeaders | undefined
        ? true
        : false
      : true
    : false

type AreResponseHeadersSchemasCompatible<
  TResponses extends HttpProtocolDefinition['responses'],
> = false extends {
  [TVariant in keyof TResponses]: IsResponseHeadersSchemaCompatible<
    TResponses[TVariant]
  >
}[keyof TResponses]
  ? false
  : true

type HttpResponseConstraint<TDefinition extends HttpProtocolDefinition> =
  string extends keyof TDefinition['responses']
    ? { readonly responses: never }
    : AreResponseHeadersSchemasCompatible<TDefinition['responses']> extends true
      ? AreErrorMappingsCompatible<TDefinition['responses']> extends true
        ? unknown
        : { readonly responses: never }
      : { readonly responses: never }

type IsExactParamsSchemaMap<
  TPath extends string,
  TSchemas extends HttpParamsSchemas,
> =
  Exclude<keyof TSchemas, PathParamNames<TPath>> extends never
    ? Exclude<PathParamNames<TPath>, keyof TSchemas> extends never
      ? true
      : false
    : false

type DoParamsSchemasAcceptStrings<TSchemas extends HttpParamsSchemas> =
  false extends {
    [TName in keyof TSchemas]: IsRawStringCompatible<
      SchemaInput<TSchemas[TName]>
    >
  }[keyof TSchemas]
    ? false
    : true

type IsRawStringCompatible<TInput> = string extends TInput
  ? true
  : [Extract<TInput, string>] extends [never]
    ? false
    : true

type IsUnion<TValue, TCandidate = TValue> = TValue extends unknown
  ? [TCandidate] extends [TValue]
    ? false
    : true
  : never

type IsSingleStringLiteral<TValue extends string> = string extends TValue
  ? false
  : true extends IsUnion<TValue>
    ? false
    : true

type HttpPathConstraint<TDefinition extends HttpProtocolDefinition> =
  IsSingleStringLiteral<TDefinition['method']> extends false
    ? { readonly method: never }
    : IsSingleStringLiteral<TDefinition['path']> extends false
      ? { readonly path: never }
      : IsValidHttpPath<TDefinition['path']> extends true
        ? TDefinition['request'] extends {
            readonly params: infer TSchemas extends HttpParamsSchemas
          }
          ? IsExactParamsSchemaMap<TDefinition['path'], TSchemas> extends true
            ? DoParamsSchemasAcceptStrings<TSchemas> extends true
              ? unknown
              : { readonly request: never }
            : { readonly request: never }
          : HasValidationBeforeTerminal<
                TDefinition['pipeline'],
                'params'
              > extends true
            ? { readonly pipeline: never }
            : unknown
        : { readonly path: never }

type ErrorMappingResult<TResponse> = TResponse extends {
  readonly error: infer TMapping extends HttpErrorMapping<any, any>
}
  ? Awaited<ReturnType<TMapping['map']>>
  : never

type IsErrorMappingCompatible<TResponse> =
  TResponse extends HttpResponseDefinition
    ? TResponse extends { readonly error: HttpErrorMapping<any, any> }
      ? ErrorMappingResult<TResponse> extends HttpResponseResult<
          ResponseBodyOutput<TResponse>,
          ResponseHeadersOutput<TResponse>
        >
        ? true
        : false
      : true
    : false

type AreErrorMappingsCompatible<
  TResponses extends HttpProtocolDefinition['responses'],
> = false extends {
  [TVariant in keyof TResponses]: IsErrorMappingCompatible<TResponses[TVariant]>
}[keyof TResponses]
  ? false
  : true

type IsConstraintSatisfied<TConstraint> = keyof TConstraint extends never
  ? true
  : false

type IsBranchPipelineTerminalFree<TPipeline extends readonly PipelineItem[]> =
  number extends TPipeline['length']
    ? false
    : TPipeline extends readonly [infer THead, ...infer TTail]
      ? THead extends TerminalLayerDescriptor
        ? false
        : THead extends {
              readonly kind: 'layer'
              readonly pipeline: infer TChild extends readonly PipelineItem[]
            }
          ? IsBranchPipelineTerminalFree<TChild> extends true
            ? IsBranchPipelineTerminalFree<
                Extract<TTail, readonly PipelineItem[]>
              >
            : false
          : IsBranchPipelineTerminalFree<
              Extract<TTail, readonly PipelineItem[]>
            >
      : true

type IsHttpBranchPathValid<TBranch extends HttpBranchDefinition> =
  TBranch extends { readonly path: infer TPath extends string }
    ? string extends TPath
      ? false
      : TPath extends '/'
        ? true
        : IsValidHttpPath<TPath>
    : true

type IsHttpBranchPipelineValid<TBranch extends HttpBranchDefinition> =
  TBranch extends {
    readonly pipeline: infer TPipeline extends readonly PipelineItem[]
  }
    ? IsBranchPipelineTerminalFree<TPipeline>
    : true

type IsHttpBranchResponsesValid<TBranch extends HttpBranchDefinition> =
  TBranch extends {
    readonly responses: infer TResponses extends Readonly<
      Record<string, HttpResponseDefinition>
    >
  }
    ? string extends keyof TResponses
      ? false
      : AreResponseHeadersSchemasCompatible<TResponses> extends true
        ? AreErrorMappingsCompatible<TResponses>
        : false
    : true

type HasHttpResponseCollision<
  TParent extends Readonly<Record<string, HttpResponseDefinition>>,
  TLocal extends Readonly<Record<string, HttpResponseDefinition>>,
> = Extract<keyof TParent, keyof TLocal> extends never ? false : true

type IsHttpResolvedLeafValid<
  TDefinition extends HttpProtocolDefinition,
  TParentPath extends string,
  TParentPipeline extends readonly PipelineItem[],
  TParentResponses extends Readonly<Record<string, HttpResponseDefinition>>,
  TEffective extends HttpProtocolDefinition = EffectiveHttpDefinition<
    TDefinition,
    TParentPath,
    TParentPipeline,
    TParentResponses
  >,
> = IsConstraintSatisfied<
  HttpPipelineConstraint<TEffective> &
    HttpResponseConstraint<TEffective> &
    HttpPathConstraint<TEffective>
>

type IsHttpTreeValid<
  TTree extends Readonly<Record<string, unknown>>,
  TParentPath extends string = '',
  TParentPipeline extends readonly PipelineItem[] = readonly [],
  TParentResponses extends Readonly<Record<string, HttpResponseDefinition>> =
    {},
> = false extends {
  [K in keyof TTree & string]: SourceOfHttpNode<TTree[K]> extends infer TSource
    ? TSource extends HttpProtocolDefinition
      ? IsHttpResolvedLeafValid<
          TSource,
          TParentPath,
          TParentPipeline,
          TParentResponses
        >
      : TSource extends HttpBranchDefinition
        ? IsHttpBranchPathValid<TSource> extends true
          ? IsHttpBranchPipelineValid<TSource> extends true
            ? IsHttpBranchResponsesValid<TSource> extends true
              ? HasHttpResponseCollision<
                  TParentResponses,
                  BranchResponsesOf<TSource>
                > extends false
                ? IsHttpTreeValid<
                    TSource['routes'],
                    JoinHttpPath<TParentPath, BranchPathOf<TSource>>,
                    readonly [...TParentPipeline, ...BranchPipelineOf<TSource>],
                    MergeHttpResponses<
                      TParentResponses,
                      BranchResponsesOf<TSource>
                    >
                  >
                : false
              : false
            : false
          : false
        : false
    : false
}[keyof TTree & string]
  ? false
  : true

type HttpTreeConstraint<TDefinitions extends HttpRouteTree> =
  IsHttpTreeValid<TDefinitions> extends true
    ? unknown
    : { readonly __invalidHttpRouteTree__: never }

function defineHttp<const TDefinition extends HttpProtocolDefinition>(
  definition: TDefinition &
    HttpPipelineConstraint<TDefinition> &
    HttpResponseConstraint<TDefinition> &
    HttpPathConstraint<TDefinition>,
): HttpProtocol<TDefinition> {
  const segments = parseHttpPath(definition.path)
  const paramsSchemas = definition.request?.params
  if (paramsSchemas) {
    const pathNames = segments.flatMap((segment) =>
      segment.kind === 'param' ? [segment.name] : [],
    )
    const schemaNames = Object.keys(paramsSchemas)
    if (
      pathNames.length !== schemaNames.length ||
      pathNames.some((name) => !Object.hasOwn(paramsSchemas, name))
    ) {
      throw new Error(
        'HTTP path parameter names and request.params keys must match',
      )
    }
  } else if (hasParamsValidation(definition.pipeline)) {
    throw new Error('validate.params requires request.params')
  }
  const body = definition.request?.body
  if (body && body.contentType.trim().length === 0) {
    throw new Error('HTTP request body contentType must not be empty')
  }
  return {
    kind: 'protocol',
    protocol: 'http',
    interaction: definition.interaction ?? 'unary',
    dispatchKey: createHttpDispatchKey(definition.method, segments),
    definition,
  } as unknown as HttpProtocol<TDefinition>
}

function hasParamsValidation(pipeline: readonly PipelineItem[]): boolean {
  return pipeline.some(
    (item) =>
      (item.kind === 'validation' && item.part === 'params') ||
      (item.kind === 'layer' &&
        hasParamsValidation(childPipelineOf(item) ?? [])),
  )
}

interface HttpResolvedTemplateLeaf {
  readonly kind: 'leaf'
  readonly source: HttpProtocolDefinition
  readonly handlerName: string
  readonly protocol: HttpProtocol
}

interface HttpResolvedTemplateBranch {
  readonly kind: 'branch'
  readonly source: HttpBranchDefinition
  readonly children: Readonly<Record<string, HttpResolvedTemplate>>
}

type HttpResolvedTemplate =
  | HttpResolvedTemplateLeaf
  | HttpResolvedTemplateBranch

interface HttpResolution {
  readonly procedures: Record<string, HttpProtocol>
  readonly tree: Readonly<Record<string, HttpResolvedTemplate>>
}

type HttpProtocolGroup<TDefinitions extends HttpRouteTree> = ProtocolGroup<
  'http',
  FlatHttpProtocols<TDefinitions> extends infer TProtocols extends Record<
    string,
    ProtocolDescriptor<'http'>
  >
    ? TProtocols
    : never
>

function defineHttpGroup<const TDefinitions extends HttpRouteTree>(
  definitions: TDefinitions & HttpTreeConstraint<TDefinitions>,
): HttpProtocolGroup<TDefinitions> {
  const resolution = resolveHttpTree(definitions, {
    path: '',
    pipeline: [],
    responses: {},
    procedurePrefix: '',
  })
  const group = {
    kind: 'protocol-group' as const,
    protocol: 'http' as const,
    procedures: Object.freeze({ ...resolution.procedures }),
  } as ProtocolGroup<'http', Record<string, HttpProtocol>> &
    Record<PropertyKey, unknown>
  Object.defineProperty(group, protocolNamespaceBuilder, {
    enumerable: false,
    value: (root: ContractDefinition) =>
      buildHttpNamespace(resolution.tree, root, []),
  })
  return Object.freeze(group) as unknown as HttpProtocolGroup<TDefinitions>
}

interface HttpResolutionContext {
  readonly path: string
  readonly pipeline: readonly PipelineItem[]
  readonly responses: Readonly<Record<string, HttpResponseDefinition>>
  readonly procedurePrefix: string
}

function resolveHttpTree(
  definitions: HttpRouteTree,
  context: HttpResolutionContext,
): HttpResolution {
  const procedures: Record<string, HttpProtocol> = {}
  const tree: Record<string, HttpResolvedTemplate> = {}

  for (const [name, candidate] of Object.entries(definitions)) {
    const metadata =
      typeof candidate === 'object' &&
      candidate !== null &&
      httpNodeMetadata in candidate
        ? (candidate[httpNodeMetadata] as {
            readonly kind: 'leaf' | 'branch'
            readonly source: HttpProtocolDefinition | HttpBranchDefinition
            readonly handlerName?: string
          })
        : undefined
    const source = (metadata?.source ?? candidate) as
      | HttpProtocolDefinition
      | HttpBranchDefinition
    const procedureName =
      context.procedurePrefix === ''
        ? name
        : `${context.procedurePrefix}.${name}`

    if ('method' in source) {
      const responses = mergeHttpResponses(context.responses, source.responses)
      const definition: HttpProtocolDefinition = {
        ...source,
        path: joinHttpPath(context.path, source.path),
        responses,
        pipeline: [...context.pipeline, ...source.pipeline],
      }
      const protocol = defineHttp(definition as never)
      procedures[procedureName] = protocol
      tree[name] = {
        kind: 'leaf',
        source,
        handlerName:
          metadata?.kind === 'leaf' && metadata.handlerName
            ? metadata.handlerName
            : name,
        protocol,
      }
      continue
    }

    assertBranchPipeline(source.pipeline ?? [])
    const branchResponses = mergeHttpResponses(
      context.responses,
      source.responses ?? {},
    )
    const branch = resolveHttpTree(source.routes, {
      path: joinHttpPath(context.path, source.path ?? ''),
      pipeline: [...context.pipeline, ...(source.pipeline ?? [])],
      responses: branchResponses,
      procedurePrefix: procedureName,
    })
    Object.assign(procedures, branch.procedures)
    tree[name] = {
      kind: 'branch',
      source,
      children: branch.tree,
    }
  }

  return { procedures, tree: Object.freeze(tree) }
}

function joinHttpPath(parent: string, child: string): string {
  if (parent === '') return child
  if (child === '' || child === '/') return parent
  return `${parent}${child}`
}

function mergeHttpResponses(
  parent: Readonly<Record<string, HttpResponseDefinition>>,
  local: Readonly<Record<string, HttpResponseDefinition>>,
): Readonly<Record<string, HttpResponseDefinition>> {
  for (const name of Object.keys(local)) {
    if (Object.hasOwn(parent, name)) {
      throw new Error(`Duplicate inherited HTTP response variant: ${name}`)
    }
  }
  return Object.freeze({ ...parent, ...local })
}

function assertBranchPipeline(pipeline: readonly PipelineItem[]): void {
  for (const item of pipeline) {
    if (item.kind === 'terminal') {
      throw new Error('HTTP branch pipeline must not contain a terminal layer')
    }
    if (item.kind === 'layer') {
      const child = childPipelineOf(item)
      if (child) assertBranchPipeline(child)
    }
  }
}

function buildHttpNamespace(
  tree: Readonly<Record<string, HttpResolvedTemplate>>,
  root: ContractDefinition,
  parentPath: readonly string[],
): Readonly<Record<string, HttpResolvedNode>> {
  const namespace: Record<string, HttpResolvedNode> = {}
  for (const [name, template] of Object.entries(tree)) {
    namespace[name] = buildHttpNode(template, root, [...parentPath, name])
  }
  return Object.freeze(namespace)
}

function buildHttpNode(
  template: HttpResolvedTemplate,
  root: ContractDefinition,
  path: readonly string[],
): HttpResolvedNode {
  if (template.kind === 'leaf') {
    const binding = {
      kind: 'contract' as const,
      procedures: Object.freeze({
        [template.handlerName]: Object.freeze({
          kind: 'procedure' as const,
          protocols: Object.freeze({ http: template.protocol }),
        }),
      }),
    } as ContractDefinition & Record<PropertyKey, unknown>
    Object.defineProperty(binding, contractNodeMetadata, {
      enumerable: false,
      value: Object.freeze({
        root,
        path: Object.freeze(['http', ...path]),
        procedures: Object.freeze({
          [template.handlerName]: path.join('.'),
        }),
      }),
    })
    Object.freeze(binding)

    const node = {} as Record<PropertyKey, unknown>
    Object.defineProperty(node, contractNodeBinding, {
      enumerable: false,
      value: binding,
    })
    Object.defineProperty(node, httpNodeMetadata, {
      enumerable: false,
      value: Object.freeze({
        kind: 'leaf' as const,
        root,
        path: Object.freeze([...path]),
        source: template.source,
        handlerName: template.handlerName,
      }),
    })
    return Object.freeze(node) as unknown as HttpResolvedLeaf
  }

  const children = buildHttpNamespace(template.children, root, path)
  const procedures: Record<
    string,
    {
      readonly kind: 'procedure'
      readonly protocols: { readonly http: HttpProtocol }
    }
  > = {}
  collectHttpNodeProcedures(template.children, '', procedures)
  const binding = {
    kind: 'contract' as const,
    procedures: Object.freeze(procedures),
  } as ContractDefinition & Record<PropertyKey, unknown>
  Object.defineProperty(binding, contractNodeMetadata, {
    enumerable: false,
    value: Object.freeze({
      root,
      path: Object.freeze(['http', ...path]),
      procedures: Object.freeze(
        Object.fromEntries(
          Object.keys(procedures).map((procedure) => [
            procedure,
            [...path, procedure].join('.'),
          ]),
        ),
      ),
    }),
  })
  Object.freeze(binding)

  const node = { ...children } as Record<PropertyKey, unknown>
  Object.defineProperty(node, contractNodeBinding, {
    enumerable: false,
    value: binding,
  })
  Object.defineProperty(node, httpNodeMetadata, {
    enumerable: false,
    value: Object.freeze({
      kind: 'branch' as const,
      root,
      path: Object.freeze([...path]),
      source: template.source,
    }),
  })
  return Object.freeze(node) as unknown as HttpResolvedBranch
}

function collectHttpNodeProcedures(
  tree: Readonly<Record<string, HttpResolvedTemplate>>,
  prefix: string,
  procedures: Record<
    string,
    {
      readonly kind: 'procedure'
      readonly protocols: { readonly http: HttpProtocol }
    }
  >,
): void {
  for (const [name, template] of Object.entries(tree)) {
    const path = prefix === '' ? name : `${prefix}.${name}`
    if (template.kind === 'leaf') {
      procedures[path] = Object.freeze({
        kind: 'procedure',
        protocols: Object.freeze({ http: template.protocol }),
      })
      continue
    }
    collectHttpNodeProcedures(template.children, path, procedures)
  }
}

export interface HttpProtocolFactory extends ProtocolFactory<'http'> {
  <const TDefinitions extends HttpRouteTree>(
    definitions: TDefinitions & HttpTreeConstraint<TDefinitions>,
  ): HttpProtocolGroup<TDefinitions>
  readonly route: typeof defineHttp
  readonly controller: TerminalLayerDescriptor<'http'>
  readonly error: typeof httpError
}

export const http = Object.assign(defineHttpGroup, {
  protocol: 'http' as const,
  route: defineHttp,
  controller,
  error: httpError,
}) as HttpProtocolFactory

function validationLayer<const TPart extends ValidationLayerDescriptor['part']>(
  part: TPart,
): ValidationLayerDescriptor & {
  readonly part: TPart
  readonly name: `validate.${TPart}`
} {
  return Object.freeze({
    kind: 'validation',
    name: `validate.${part}`,
    role: 'validation',
    part,
  }) as ValidationLayerDescriptor & {
    readonly part: TPart
    readonly name: `validate.${TPart}`
  }
}

export const validate = Object.freeze({
  params: validationLayer('params'),
  query: validationLayer('query'),
  headers: validationLayer('headers'),
  body: validationLayer('body'),
})

type ProceduresForHttp<TContract extends ContractDefinition> = {
  [
    K in keyof TContract['procedures']
  ]: 'http' extends keyof TContract['procedures'][K]['protocols'] ? K : never
}[keyof TContract['procedures']] &
  string

type HttpProtocolAt<
  TContract extends ContractDefinition,
  TProcedure extends keyof TContract['procedures'],
> = TContract['procedures'][TProcedure]['protocols']['http' &
  keyof TContract['procedures'][TProcedure]['protocols']] extends infer TProtocol
  ? TProtocol extends HttpProtocol<any, any>
    ? TProtocol
    : never
  : never

type RequestBodySchema<TBody> =
  TBody extends HttpRequestBodyDefinition<infer TSchema> ? TSchema : never

type PartOutput<
  TDefinition extends HttpProtocolDefinition,
  TPart extends keyof HttpRequestDefinition,
> = TPart extends 'params'
  ? HasValidationBeforeTerminal<TDefinition['pipeline'], 'params'> extends true
    ? TDefinition['request'] extends {
        readonly params: infer TSchemas extends HttpParamsSchemas
      }
      ? ValidatedPathParams<TSchemas>
      : never
    : RawPathParams<TDefinition['path']>
  : HasValidationBeforeTerminal<TDefinition['pipeline'], TPart> extends false
    ? unknown
    : TDefinition['request'] extends HttpRequestDefinition
      ? TPart extends keyof TDefinition['request']
        ? TPart extends 'body'
          ? SchemaOutput<
              RequestBodySchema<NonNullable<TDefinition['request'][TPart]>>
            >
          : NonNullable<TDefinition['request'][TPart]> extends StandardSchemaV1
            ? SchemaOutput<NonNullable<TDefinition['request'][TPart]>>
            : unknown
        : unknown
      : unknown

type ValidatedPathParams<TSchemas extends HttpParamsSchemas> = Readonly<{
  [TName in keyof TSchemas]: SchemaOutput<TSchemas[TName]>
}>

type HttpResultHeaders<THeaders> =
  IsAny<THeaders> extends true
    ? { readonly headers?: HttpHeaders }
    : IsUnknown<THeaders> extends true
      ? { readonly headers?: HttpHeaders }
      : [THeaders] extends [never]
        ? { readonly headers?: never }
        : undefined extends THeaders
          ? { readonly headers?: Exclude<THeaders, undefined> }
          : { readonly headers: THeaders }

export type HttpResponseResult<TBody, THeaders = unknown> = {
  readonly body: TBody
} & HttpResultHeaders<THeaders>

type ErrorOf<TDefinition> =
  TDefinition extends HttpErrorMatcher<infer TError> ? TError : never

export function httpError<
  TDefinition extends HttpErrorMatcher<{ readonly data: unknown }>,
>(
  definition: TDefinition,
): HttpErrorMapping<
  ErrorOf<TDefinition>,
  { readonly body: ErrorOf<TDefinition>['data'] }
>
export function httpError<
  TDefinition extends HttpErrorMatcher<{ readonly data: unknown }>,
  const TResult,
>(
  definition: TDefinition,
  map: (error: ErrorOf<TDefinition>) => TResult | Promise<TResult>,
): HttpErrorMapping<ErrorOf<TDefinition>, TResult>
export function httpError(
  definition: HttpErrorMatcher<{ readonly data: unknown }>,
  map?: (error: { readonly data: unknown }) => unknown | Promise<unknown>,
): HttpErrorMapping {
  return Object.freeze({
    kind: 'http-error-mapping',
    definition,
    map: map ?? ((error) => ({ body: error.data })),
  })
}

export type LogicalHttpResult<
  TVariant extends string = string,
  TBody = unknown,
  THeaders = unknown,
> = {
  readonly kind: 'http-result'
  readonly variant: TVariant
  readonly body: TBody
} & HttpResultHeaders<THeaders>

type ResponseHelpers<TDefinition extends HttpProtocolDefinition> = {
  [TVariant in keyof TDefinition['responses'] & string]: (
    result: HttpResponseResult<
      ResponseBodyOutput<TDefinition['responses'][TVariant]>,
      ResponseHeadersOutput<TDefinition['responses'][TVariant]>
    >,
  ) => LogicalHttpResult<
    TVariant,
    ResponseBodyOutput<TDefinition['responses'][TVariant]>,
    ResponseHeadersOutput<TDefinition['responses'][TVariant]>
  >
}

type HttpControllerContextDefinition<
  TDefinition extends HttpProtocolDefinition,
> = {
  readonly params: PartOutput<TDefinition, 'params'>
  readonly query: PartOutput<TDefinition, 'query'>
  readonly headers: PartOutput<TDefinition, 'headers'>
  readonly body: PartOutput<TDefinition, 'body'>
  readonly response: ResponseHelpers<TDefinition>
  readonly logger: Logger
  readonly signal: AbortSignal
} & ContextProvidedBeforeTerminal<TDefinition['pipeline']>

export type HttpControllerContext<TProtocol extends HttpProtocol<any>> =
  HttpControllerContextDefinition<TProtocol['definition']>

export type ControllerOf<
  TContract extends ContractDefinition,
  TProtocol extends 'http',
  TProcedures extends ProceduresForHttp<TContract> =
    ProceduresForHttp<TContract>,
> = TProtocol extends 'http'
  ? {
      [K in TProcedures]: (
        context: HttpControllerContext<HttpProtocolAt<TContract, K>>,
      ) =>
        | DeclaredHttpResults<
            HttpProtocolAt<TContract, K>['definition']['responses']
          >
        | Promise<
            DeclaredHttpResults<
              HttpProtocolAt<TContract, K>['definition']['responses']
            >
          >
    }
  : never

export type ContextOf<
  TController,
  TProcedure extends keyof TController,
> = TController[TProcedure] extends (
  context: infer TContext,
  ...args: any[]
) => any
  ? TContext
  : never
