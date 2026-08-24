import type { ContextKey, ContextProperties } from './context-key.js'

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
  | ValidationLayerDescriptor
  | TerminalLayerDescriptor

export type ShortCircuitResultOf<TItem> = TItem extends {
  readonly [shortCircuitResultType]?: infer TResult
}
  ? TResult
  : never

export type ShortCircuitDeclarationsOf<TItem> = TItem extends {
  readonly shortCircuits: infer TShortCircuits
}
  ? TShortCircuits
  : never

export type ContextProvidedBeforeTerminal<
  TPipeline extends readonly PipelineItem[],
  TContext extends object = {},
> = number extends TPipeline['length']
  ? TContext
  : TPipeline extends readonly [infer THead, ...infer TTail]
    ? THead extends TerminalLayerDescriptor
      ? TContext
      : THead extends LayerDescriptor<
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
        ? ContextProvidedBeforeTerminal<
            Extract<TTail, readonly PipelineItem[]>,
            TContext & ContextProperties<TProvides>
          >
        : ContextProvidedBeforeTerminal<
            Extract<TTail, readonly PipelineItem[]>,
            TContext
          >
    : TContext

export type HasValidationBeforeTerminal<
  TPipeline extends readonly PipelineItem[],
  TPart extends ValidatedInputPart,
> = number extends TPipeline['length']
  ? false
  : TPipeline extends readonly [infer THead, ...infer TTail]
    ? THead extends TerminalLayerDescriptor
      ? false
      : THead extends ValidationLayerDescriptor
        ? THead['part'] extends TPart
          ? true
          : HasValidationBeforeTerminal<Extract<TTail, readonly PipelineItem[]>, TPart>
        : HasValidationBeforeTerminal<Extract<TTail, readonly PipelineItem[]>, TPart>
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

type EffectiveLayerState<
  TProvides extends readonly ContextKey[],
  TState,
> = number extends TProvides['length']
  ? TState
  : TProvides extends readonly []
    ? TState
    : void

export function layer<
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
export function layer(
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
