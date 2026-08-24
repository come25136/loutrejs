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
export function shortCircuit<TResult, TState = undefined>(
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
> = number extends TProvides['length']
  ? TState | void | ContextProperties<TProvides> | ShortCircuit<unknown, TState>
  : TProvides extends readonly []
    ? TState | void | ShortCircuit<unknown, TState>
    : ContextProperties<TProvides> | ShortCircuit<unknown, TState>

export interface LayerDescriptor<
  TContext = unknown,
  TState = unknown,
  TRequires extends readonly ContextKey[] = readonly ContextKey[],
  TProvides extends readonly ContextKey[] = readonly ContextKey[],
> {
  readonly kind: 'layer'
  readonly name: string
  readonly role: Exclude<LayerRole, 'terminal' | 'validation'>
  readonly requires: TRequires
  readonly provides: TProvides
  readonly requiresValidated: readonly ValidatedInputPart[]
  readonly inbound?: (
    context: TContext & ContextProperties<TRequires>,
  ) => ProvidedResult<TProvides, TState> | Promise<ProvidedResult<TProvides, TState>>
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
  | LayerDescriptor<any, any, any, any>
  | ValidationLayerDescriptor
  | TerminalLayerDescriptor

export type ContextProvidedBeforeTerminal<
  TPipeline extends readonly PipelineItem[],
  TContext extends object = {},
> = number extends TPipeline['length']
  ? TContext
  : TPipeline extends readonly [infer THead, ...infer TTail]
    ? THead extends TerminalLayerDescriptor
      ? TContext
      : THead extends LayerDescriptor<any, any, any, infer TProvides>
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
> {
  readonly name: string
  readonly role?: Exclude<LayerRole, 'terminal' | 'validation'>
  readonly requires?: TRequires
  readonly provides?: TProvides
  readonly requiresValidated?: readonly ValidatedInputPart[]
  readonly inbound?: LayerDescriptor<
    TContext,
    TState,
    TRequires,
    TProvides
  >['inbound']
  readonly outbound?: LayerDescriptor<
    TContext,
    TState,
    TRequires,
    TProvides
  >['outbound']
}

type IsUnknown<T> = unknown extends T
  ? [keyof T] extends [never]
    ? true
    : false
  : false

export function layer<
  const TRequires extends readonly ContextKey[] = readonly [],
  const TProvides extends readonly ContextKey[] = readonly [],
  TContext = unknown,
  TState = void,
>(
  definition: LayerDefinition<TContext, TState, TRequires, TProvides>,
): LayerDescriptor<TContext, TState, TRequires, TProvides>
export function layer<TContext, TState = void>(
  definition: IsUnknown<TContext> extends true
    ? never
    : LayerDefinition<
        TContext,
        TState,
        readonly ContextKey[],
        readonly ContextKey[]
      >,
): LayerDescriptor<
  TContext,
  TState,
  readonly ContextKey[],
  readonly ContextKey[]
>
export function layer(
  definition: LayerDefinition<
    unknown,
    unknown,
    readonly ContextKey[],
    readonly ContextKey[]
  >,
): LayerDescriptor {
  return {
    kind: 'layer',
    name: definition.name,
    role: definition.role ?? 'generic',
    requires: definition.requires ?? [],
    provides: definition.provides ?? [],
    requiresValidated: definition.requiresValidated ?? [],
    ...(definition.inbound === undefined ? {} : { inbound: definition.inbound }),
    ...(definition.outbound === undefined ? {} : { outbound: definition.outbound }),
  }
}
