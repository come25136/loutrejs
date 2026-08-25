import type { ContextKey, ContextProperties } from './context-key.js'
import type { Scope } from './provider.js'
import type { TokenLike, TokenValue } from './token.js'

export type LayerRole =
  | 'generic'
  | 'authentication'
  | 'guard'
  | 'validation'
  | 'framework'
  | 'terminal'

export type ValidatedInputPart = 'params' | 'query' | 'headers' | 'body'

export interface Outcome<T = unknown> {
  readonly ok: boolean
  readonly value?: T
  readonly error?: unknown
}

const shortCircuitMarker = Symbol('loutre.short-circuit')

export interface ShortCircuit<TResult = unknown, TState = undefined> {
  readonly kind: 'short-circuit'
  readonly result: TResult
  readonly state: TState
  readonly [shortCircuitMarker]: true
}

/**
 * 残りのinbound Layerとterminalを実行せず、Logical ResultをProtocol
 * Finalizationへ送る。現在のLayerは正常にenteredとなり、outboundの対象になる。
 */
export function shortCircuit<const TResult, TState = undefined>(
  result: TResult,
  state?: TState,
): ShortCircuit<TResult, TState | undefined> {
  return {
    kind: 'short-circuit',
    result,
    state,
    [shortCircuitMarker]: true,
  }
}

export function isShortCircuit(value: unknown): value is ShortCircuit {
  return (
    typeof value === 'object' &&
    value !== null &&
    shortCircuitMarker in value &&
    value[shortCircuitMarker] === true
  )
}

type ProvidedResult<
  TProvides extends readonly ContextKey[],
  TState,
  TShortCircuitResult,
> = number extends TProvides['length']
  ? TState | void | ContextProperties<TProvides> | ShortCircuit<TShortCircuitResult, TState>
  : TProvides extends readonly []
    ? TState | void | ShortCircuit<TShortCircuitResult, TState>
    : ContextProperties<TProvides> | ShortCircuit<TShortCircuitResult, TState>

declare const shortCircuitResultType: unique symbol

export interface ShortCircuitDeclaration {
  readonly protocol: string
  readonly variant: string
  readonly response?: Readonly<Record<string, unknown>>
}

export interface LayerDescriptor<
  TContext = unknown,
  TState = unknown,
  TRequires extends readonly ContextKey[] = readonly ContextKey[],
  TProvides extends readonly ContextKey[] = readonly ContextKey[],
  TShortCircuitResult = unknown,
  TShortCircuits extends readonly ShortCircuitDeclaration[] = readonly ShortCircuitDeclaration[],
  TName extends string = string,
  TRole extends Exclude<LayerRole, 'terminal' | 'validation'> = Exclude<
    LayerRole,
    'terminal' | 'validation'
  >,
  TRequiresValidated extends readonly ValidatedInputPart[] = readonly ValidatedInputPart[],
> {
  readonly kind: 'layer'
  readonly composition?: never
  readonly name: TName
  readonly role: TRole
  readonly requires: TRequires
  readonly provides: TProvides
  readonly requiresValidated: TRequiresValidated
  readonly shortCircuits: TShortCircuits
  readonly [shortCircuitResultType]?: TShortCircuitResult
  readonly inbound?: (
    context: TContext & ContextProperties<TRequires>,
  ) =>
    | ProvidedResult<TProvides, TState, TShortCircuitResult>
    | Promise<ProvidedResult<TProvides, TState, TShortCircuitResult>>
  readonly outbound?: (
    context: TContext & ContextProperties<TRequires> & ContextProperties<TProvides>,
    outcome: Outcome,
    state: TProvides extends readonly []
      ? TState | undefined
      : ContextProperties<TProvides> | undefined,
  ) => void | Promise<void>
}

export interface ExecutionScope {
  run(execute: () => Promise<void>): Promise<void>
}

export interface LayerDependency<
  TToken extends TokenLike = TokenLike,
> {
  readonly token: TToken
  readonly scope?: Scope
}

export type LayerInjection = TokenLike | LayerDependency

export type InjectedLayerDependencies<
  TInject extends readonly LayerInjection[],
> = {
  [TIndex in keyof TInject]: TInject[TIndex] extends LayerDependency<infer TToken>
    ? TokenValue<TToken>
    : TInject[TIndex] extends TokenLike
      ? TokenValue<TInject[TIndex]>
      : never
}

export interface CompositeLayerDescriptor<
  TPipeline extends readonly PipelineItem[] = readonly PipelineItem[],
  TInject extends readonly LayerInjection[] = readonly LayerInjection[],
  TContext = unknown,
  TName extends string = string,
  TRole extends Exclude<LayerRole, 'terminal' | 'validation'> = Exclude<
    LayerRole,
    'terminal' | 'validation'
  >,
  TRequires extends readonly ContextKey[] = readonly ContextKey[],
  TRequiresValidated extends readonly ValidatedInputPart[] = readonly ValidatedInputPart[],
> {
  readonly kind: 'layer'
  readonly composition: 'pipeline'
  readonly name: TName
  readonly role: TRole
  readonly requires: TRequires
  readonly requiresValidated: TRequiresValidated
  readonly inject: TInject
  readonly pipeline: TPipeline
  readonly scope: (
    context: TContext & ContextProperties<TRequires>,
    ...dependencies: InjectedLayerDependencies<TInject>
  ) => ExecutionScope
  readonly graph?: {
    readonly attributes?: Readonly<Record<string, string | number | boolean>>
  }
}

export interface ValidationLayerDescriptor {
  readonly kind: 'validation'
  readonly name: `validate.${'params' | 'query' | 'headers' | 'body'}`
  readonly role: 'validation'
  readonly part: 'params' | 'query' | 'headers' | 'body'
}

export interface TerminalLayerDescriptor<TProtocol extends string = string> {
  readonly kind: 'terminal'
  readonly name: `${TProtocol}.${string}`
  readonly role: 'terminal'
  readonly protocol: TProtocol
}

export type PipelineItem =
  | LayerDescriptor<any, any, any, any, any, any, any, any, any>
  | CompositeLayerDescriptor<any, any, any, any, any, any, any>
  | ValidationLayerDescriptor
  | TerminalLayerDescriptor

interface PipelineTerminalState<
  THasTerminal extends boolean,
  TValid extends boolean,
> {
  readonly hasTerminal: THasTerminal
  readonly valid: TValid
}

type InvalidPipelineTerminalState = PipelineTerminalState<boolean, false>

type FoldPipelineTerminals<
  TPipeline extends readonly PipelineItem[],
  TProtocol extends string,
  TState extends PipelineTerminalState<boolean, boolean>,
> = TState['valid'] extends false
  ? TState
  : number extends TPipeline['length']
    ? InvalidPipelineTerminalState
    : TPipeline extends readonly [infer THead, ...infer TTail]
      ? TState['hasTerminal'] extends true
        ? InvalidPipelineTerminalState
        : FoldPipelineTerminals<
            Extract<TTail, readonly PipelineItem[]>,
            TProtocol,
            FoldPipelineItemTerminals<THead, TProtocol, TState>
          >
      : TState

type FoldPipelineItemTerminals<
  TItem,
  TProtocol extends string,
  TState extends PipelineTerminalState<boolean, boolean>,
> = TItem extends TerminalLayerDescriptor<infer TItemProtocol>
  ? [TItemProtocol, TProtocol] extends [TProtocol, TItemProtocol]
    ? PipelineTerminalState<true, true>
    : InvalidPipelineTerminalState
  : TItem extends CompositeLayerDescriptor<infer TPipeline>
    ? FoldPipelineTerminals<TPipeline, TProtocol, TState>
    : TState

/**
 * 再帰Pipelineをdepth-first順に評価したとき、対象Protocolのterminalが
 * ちょうど1つ存在し、かつ最後のPipelineItemであるかを判定する。
 */
export type IsValidProtocolPipeline<
  TPipeline extends readonly PipelineItem[],
  TProtocol extends string,
> = FoldPipelineTerminals<
  TPipeline,
  TProtocol,
  PipelineTerminalState<false, true>
> extends PipelineTerminalState<true, true>
  ? true
  : false

export type ShortCircuitResultOf<TItem> =
  TItem extends CompositeLayerDescriptor<infer TPipeline>
    ? ShortCircuitResultsOfPipeline<TPipeline>
    : TItem extends {
        readonly [shortCircuitResultType]?: infer TResult
      }
      ? TResult
      : never

export type ShortCircuitDeclarationsOf<TItem> =
  TItem extends CompositeLayerDescriptor<infer TPipeline>
    ? ShortCircuitDeclarationsOfPipeline<TPipeline>
    : TItem extends {
        readonly shortCircuits: infer TShortCircuits
      }
      ? TShortCircuits
      : never

type ShortCircuitResultsOfPipeline<
  TPipeline extends readonly PipelineItem[],
> = TPipeline[number] extends infer TItem ? ShortCircuitResultOf<TItem> : never

type ShortCircuitDeclarationsOfPipeline<
  TPipeline extends readonly PipelineItem[],
> = TPipeline extends readonly [infer THead, ...infer TTail]
  ? readonly [
      ...NormalizeDeclarations<ShortCircuitDeclarationsOf<THead>>,
      ...ShortCircuitDeclarationsOfPipeline<Extract<TTail, readonly PipelineItem[]>>,
    ]
  : readonly []

type NormalizeDeclarations<TDeclarations> =
  TDeclarations extends readonly ShortCircuitDeclaration[]
    ? TDeclarations
    : readonly []

interface PipelineTypeState<
  TContext extends object,
  TValidated extends ValidatedInputPart,
  TDone extends boolean,
> {
  readonly context: TContext
  readonly validated: TValidated
  readonly done: TDone
}

type FoldPipeline<
  TPipeline extends readonly PipelineItem[],
  TState extends PipelineTypeState<object, ValidatedInputPart, boolean>,
> = TState['done'] extends true
  ? TState
  : number extends TPipeline['length']
    ? TState
    : TPipeline extends readonly [infer THead, ...infer TTail]
      ? FoldPipeline<
          Extract<TTail, readonly PipelineItem[]>,
          FoldPipelineItem<THead, TState>
        >
      : TState

type FoldPipelineItem<
  TItem,
  TState extends PipelineTypeState<object, ValidatedInputPart, boolean>,
> = TItem extends TerminalLayerDescriptor
  ? PipelineTypeState<TState['context'], TState['validated'], true>
  : TItem extends ValidationLayerDescriptor
    ? PipelineTypeState<
        TState['context'],
        TState['validated'] | TItem['part'],
        false
      >
    : TItem extends CompositeLayerDescriptor<infer TPipeline>
      ? FoldPipeline<TPipeline, TState>
      : TItem extends LayerDescriptor<
          any,
          any,
          any,
          infer TProvides,
          any,
          any,
          any,
          any,
          any
        >
        ? PipelineTypeState<
            TState['context'] & ContextProperties<TProvides>,
            TState['validated'],
            false
          >
        : TState

export type ContextProvidedBeforeTerminal<
  TPipeline extends readonly PipelineItem[],
  TContext extends object = {},
> = number extends TPipeline['length']
  ? TContext
  : FoldPipeline<
      TPipeline,
      PipelineTypeState<TContext, never, false>
    >['context']

export type HasValidationBeforeTerminal<
  TPipeline extends readonly PipelineItem[],
  TPart extends ValidatedInputPart,
> = number extends TPipeline['length']
  ? false
  : TPart extends FoldPipeline<
      TPipeline,
      PipelineTypeState<{}, never, false>
    >['validated']
    ? true
    : false

export interface LayerDefinition<
  TContext,
  TState,
  TRequires extends readonly ContextKey[] = readonly [],
  TProvides extends readonly ContextKey[] = readonly [],
  TShortCircuitResult = unknown,
  TShortCircuits extends readonly ShortCircuitDeclaration[] = readonly [],
  TName extends string = string,
  TRole extends Exclude<LayerRole, 'terminal' | 'validation'> = 'generic',
  TRequiresValidated extends readonly ValidatedInputPart[] = readonly [],
> {
  readonly name: TName
  readonly role?: TRole
  readonly requires?: TRequires
  readonly provides?: TProvides
  readonly requiresValidated?: TRequiresValidated
  readonly shortCircuits?: TShortCircuits
  readonly inbound?: LayerDescriptor<
    TContext,
    TState,
    TRequires,
    TProvides,
    TShortCircuitResult
  >['inbound']
  readonly outbound?: LayerDescriptor<
    TContext,
    TState,
    TRequires,
    TProvides
  >['outbound']
}

export interface CompositeLayerDefinition<
  TPipeline extends readonly PipelineItem[],
  TInject extends readonly LayerInjection[],
  TContext,
  TName extends string,
  TRole extends Exclude<LayerRole, 'terminal' | 'validation'>,
  TRequires extends readonly ContextKey[],
  TRequiresValidated extends readonly ValidatedInputPart[],
> {
  readonly name: TName
  readonly role?: TRole
  readonly requires?: TRequires
  readonly requiresValidated?: TRequiresValidated
  readonly inject?: TInject
  readonly pipeline: TPipeline
  readonly scope: CompositeLayerDescriptor<
    TPipeline,
    TInject,
    TContext,
    TName,
    TRole,
    TRequires,
    TRequiresValidated
  >['scope']
  readonly graph?: CompositeLayerDescriptor<
    TPipeline,
    TInject,
    TContext,
    TName,
    TRole,
    TRequires,
    TRequiresValidated
  >['graph']
}

type EffectiveLayerState<
  TProvides extends readonly ContextKey[],
  TState,
> = number extends TProvides['length']
  ? TState
  : TProvides extends readonly []
    ? TState
    : void

function defineLayer<
  const TRequires extends readonly ContextKey[] = readonly [],
  const TProvides extends readonly ContextKey[] = readonly [],
  TContext = unknown,
  TState = void,
  TShortCircuitResult = unknown,
  const TShortCircuits extends readonly ShortCircuitDeclaration[] = readonly [],
  const TName extends string = string,
  const TRole extends Exclude<LayerRole, 'terminal' | 'validation'> = 'generic',
  const TRequiresValidated extends readonly ValidatedInputPart[] = readonly [],
>(
  definition: LayerDefinition<
    TContext,
    EffectiveLayerState<TProvides, TState>,
    TRequires,
    TProvides,
    TShortCircuitResult,
    TShortCircuits,
    TName,
    TRole,
    TRequiresValidated
  >,
): LayerDescriptor<
  TContext,
  EffectiveLayerState<TProvides, TState>,
  TRequires,
  TProvides,
  TShortCircuitResult,
  TShortCircuits,
  TName,
  TRole,
  TRequiresValidated
>
function defineLayer(
  definition: LayerDefinition<
    unknown,
    unknown,
    readonly ContextKey[],
    readonly ContextKey[],
    unknown,
    readonly ShortCircuitDeclaration[],
    string,
    Exclude<LayerRole, 'terminal' | 'validation'>,
    readonly ValidatedInputPart[]
  >,
): LayerDescriptor {
  return {
    kind: 'layer',
    name: definition.name,
    role: definition.role ?? 'generic',
    requires: definition.requires ?? [],
    provides: definition.provides ?? [],
    requiresValidated: definition.requiresValidated ?? [],
    shortCircuits: definition.shortCircuits ?? [],
    ...(definition.inbound === undefined ? {} : { inbound: definition.inbound }),
    ...(definition.outbound === undefined ? {} : { outbound: definition.outbound }),
  }
}

function composeLayer<
  const TPipeline extends readonly PipelineItem[],
  const TInject extends readonly LayerInjection[] = readonly [],
  TContext = unknown,
  const TName extends string = string,
  const TRole extends Exclude<LayerRole, 'terminal' | 'validation'> = 'generic',
  const TRequires extends readonly ContextKey[] = readonly [],
  const TRequiresValidated extends readonly ValidatedInputPart[] = readonly [],
>(
  definition: CompositeLayerDefinition<
    TPipeline,
    TInject,
    TContext,
    TName,
    TRole,
    TRequires,
    TRequiresValidated
  >,
): CompositeLayerDescriptor<
  TPipeline,
  TInject,
  TContext,
  TName,
  TRole,
  TRequires,
  TRequiresValidated
> {
  return {
    kind: 'layer',
    composition: 'pipeline',
    name: definition.name,
    role: definition.role ?? 'generic' as TRole,
    requires: definition.requires ?? [] as unknown as TRequires,
    requiresValidated:
      definition.requiresValidated ?? [] as unknown as TRequiresValidated,
    inject: definition.inject ?? [] as unknown as TInject,
    pipeline: definition.pipeline,
    scope: definition.scope,
    ...(definition.graph === undefined ? {} : { graph: definition.graph }),
  }
}

export const layer = Object.assign(defineLayer, {
  compose: composeLayer,
})
