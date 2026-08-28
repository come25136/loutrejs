import type { ContextKey, ContextProperties } from './context-key.js'

export type LayerRole =
  | 'generic'
  | 'authentication'
  | 'guard'
  | 'validation'
  | 'framework'
  | 'terminal'

export type ValidatedInputPart = 'params' | 'query' | 'headers' | 'body'

const shortCircuitMarker = Symbol('loutre.short-circuit')

export interface ShortCircuit<TResult = unknown> {
  readonly kind: 'short-circuit'
  readonly result: TResult
  readonly [shortCircuitMarker]: true
}

export function shortCircuit<const TResult>(
  result: TResult,
): ShortCircuit<TResult> {
  return {
    kind: 'short-circuit',
    result,
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

declare const shortCircuitResultType: unique symbol

export interface ShortCircuitDeclaration {
  readonly protocol: string
  readonly variant: string
  readonly response?: Readonly<Record<string, unknown>>
}

export type LayerNext<TProvides extends readonly ContextKey[]> =
  number extends TProvides['length']
    ? (provided: ContextProperties<TProvides>) => Promise<void>
    : TProvides extends readonly []
      ? () => Promise<void>
      : (provided: ContextProperties<TProvides>) => Promise<void>

export type LayerRuntime<
  TContext extends object,
  TProvides extends readonly ContextKey[],
  TShortCircuitResult,
> = (
  context: TContext,
  next: LayerNext<TProvides>,
) => Promise<void | ShortCircuit<TShortCircuitResult>>

export type LayerFactory<
  TContext extends object,
  TProvides extends readonly ContextKey[],
  TShortCircuitResult,
> = () => LayerRuntime<TContext, TProvides, TShortCircuitResult>

export interface LayerDefinition<
  TRequires extends readonly ContextKey[] = readonly [],
  TProvides extends readonly ContextKey[] = readonly [],
  TContext extends object = {},
  TShortCircuitResult = never,
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
  readonly factory: LayerFactory<
    TContext & ContextProperties<TRequires>,
    TProvides,
    TShortCircuitResult
  >
}

export interface LayerOccurrenceDescriptor<
  TRequires extends readonly ContextKey[] = readonly ContextKey[],
  TProvides extends readonly ContextKey[] = readonly ContextKey[],
  TShortCircuitResult = unknown,
  TShortCircuits extends readonly ShortCircuitDeclaration[] =
    readonly ShortCircuitDeclaration[],
  TName extends string = string,
  TRole extends Exclude<LayerRole, 'terminal' | 'validation'> = Exclude<
    LayerRole,
    'terminal' | 'validation'
  >,
  TRequiresValidated extends readonly ValidatedInputPart[] =
    readonly ValidatedInputPart[],
  TContext extends object = object,
  TPipeline extends readonly PipelineItem[] = readonly PipelineItem[],
> {
  readonly kind: 'layer'
  readonly name: TName
  readonly role: TRole
  readonly requires: TRequires
  readonly provides: TProvides
  readonly requiresValidated: TRequiresValidated
  readonly shortCircuits: TShortCircuits
  readonly definition: LayerDescriptor<
    TRequires,
    TProvides,
    TShortCircuitResult,
    TShortCircuits,
    TName,
    TRole,
    TRequiresValidated,
    TContext
  >
  readonly pipeline: TPipeline
  readonly factory?: never
  readonly [shortCircuitResultType]?: TShortCircuitResult
}

export interface LayerDescriptor<
  TRequires extends readonly ContextKey[] = readonly ContextKey[],
  TProvides extends readonly ContextKey[] = readonly ContextKey[],
  TShortCircuitResult = unknown,
  TShortCircuits extends readonly ShortCircuitDeclaration[] =
    readonly ShortCircuitDeclaration[],
  TName extends string = string,
  TRole extends Exclude<LayerRole, 'terminal' | 'validation'> = Exclude<
    LayerRole,
    'terminal' | 'validation'
  >,
  TRequiresValidated extends readonly ValidatedInputPart[] =
    readonly ValidatedInputPart[],
  TContext extends object = object,
> {
  <const TPipeline extends readonly PipelineItem[]>(
    pipeline: TPipeline,
  ): LayerOccurrenceDescriptor<
    TRequires,
    TProvides,
    TShortCircuitResult,
    TShortCircuits,
    TName,
    TRole,
    TRequiresValidated,
    TContext,
    TPipeline
  >
  readonly kind: 'layer'
  readonly name: TName
  readonly role: TRole
  readonly requires: TRequires
  readonly provides: TProvides
  readonly requiresValidated: TRequiresValidated
  readonly shortCircuits: TShortCircuits
  readonly factory: LayerFactory<
    TContext & ContextProperties<TRequires>,
    TProvides,
    TShortCircuitResult
  >
  readonly definition?: never
  readonly pipeline?: never
  readonly [shortCircuitResultType]?: TShortCircuitResult
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

type AnyLayerDescriptor = LayerDescriptor<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>
type AnyLayerOccurrence = LayerOccurrenceDescriptor<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>

export type PipelineItem =
  | AnyLayerDescriptor
  | AnyLayerOccurrence
  | ValidationLayerDescriptor
  | TerminalLayerDescriptor

export function isLayerOccurrence(
  item: PipelineItem,
): item is AnyLayerOccurrence {
  return item.kind === 'layer' && item.definition !== undefined
}

export function layerDefinitionOf(
  item: AnyLayerDescriptor | AnyLayerOccurrence,
): AnyLayerDescriptor {
  return isLayerOccurrence(item) ? item.definition : item
}

export function childPipelineOf(
  item: AnyLayerDescriptor | AnyLayerOccurrence,
): readonly PipelineItem[] | undefined {
  return isLayerOccurrence(item) ? item.pipeline : undefined
}

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
> =
  TItem extends TerminalLayerDescriptor<infer TItemProtocol>
    ? [TItemProtocol, TProtocol] extends [TProtocol, TItemProtocol]
      ? PipelineTerminalState<true, true>
      : InvalidPipelineTerminalState
    : TItem extends LayerOccurrenceDescriptor<
          any,
          any,
          any,
          any,
          any,
          any,
          any,
          any,
          infer TPipeline
        >
      ? FoldPipelineTerminals<TPipeline, TProtocol, TState>
      : TState

export type IsValidProtocolPipeline<
  TPipeline extends readonly PipelineItem[],
  TProtocol extends string,
> =
  FoldPipelineTerminals<
    TPipeline,
    TProtocol,
    PipelineTerminalState<false, true>
  > extends PipelineTerminalState<true, true>
    ? true
    : false

export type ShortCircuitResultOf<TItem> =
  TItem extends LayerOccurrenceDescriptor<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    infer TPipeline
  >
    ? ShortCircuitResultOfPipeline<TPipeline> | ShortCircuitResultOfLayer<TItem>
    : ShortCircuitResultOfLayer<TItem>

type ShortCircuitResultOfLayer<TItem> = TItem extends {
  readonly [shortCircuitResultType]?: infer TResult
}
  ? TResult
  : never

export type ShortCircuitDeclarationsOf<TItem> =
  TItem extends LayerOccurrenceDescriptor<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    infer TPipeline
  >
    ? readonly [
        ...NormalizeDeclarations<TItem['shortCircuits']>,
        ...ShortCircuitDeclarationsOfPipeline<TPipeline>,
      ]
    : TItem extends { readonly shortCircuits: infer TShortCircuits }
      ? TShortCircuits
      : never

type ShortCircuitResultOfPipeline<TPipeline extends readonly PipelineItem[]> =
  TPipeline[number] extends infer TItem ? ShortCircuitResultOf<TItem> : never

type ShortCircuitDeclarationsOfPipeline<
  TPipeline extends readonly PipelineItem[],
> = TPipeline extends readonly [infer THead, ...infer TTail]
  ? readonly [
      ...NormalizeDeclarations<ShortCircuitDeclarationsOf<THead>>,
      ...ShortCircuitDeclarationsOfPipeline<
        Extract<TTail, readonly PipelineItem[]>
      >,
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
    : TItem extends LayerOccurrenceDescriptor<
          any,
          infer TProvides,
          any,
          any,
          any,
          any,
          any,
          any,
          infer TPipeline
        >
      ? FoldPipeline<
          TPipeline,
          PipelineTypeState<
            TState['context'] & ContextProperties<TProvides>,
            TState['validated'],
            false
          >
        >
      : TItem extends LayerDescriptor<
            any,
            infer TProvides,
            any,
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

export function layer<
  const TRequires extends readonly ContextKey[] = readonly [],
  const TProvides extends readonly ContextKey[] = readonly [],
  TContext extends object = {},
  TShortCircuitResult = never,
  const TShortCircuits extends readonly ShortCircuitDeclaration[] = readonly [],
  const TName extends string = string,
  const TRole extends Exclude<LayerRole, 'terminal' | 'validation'> = 'generic',
  const TRequiresValidated extends readonly ValidatedInputPart[] = readonly [],
>(
  definition: LayerDefinition<
    TRequires,
    TProvides,
    TContext,
    TShortCircuitResult,
    TShortCircuits,
    TName,
    TRole,
    TRequiresValidated
  >,
): LayerDescriptor<
  TRequires,
  TProvides,
  TShortCircuitResult,
  TShortCircuits,
  TName,
  TRole,
  TRequiresValidated,
  TContext
> {
  let descriptor: LayerDescriptor<
    TRequires,
    TProvides,
    TShortCircuitResult,
    TShortCircuits,
    TName,
    TRole,
    TRequiresValidated,
    TContext
  >
  const callable = <const TPipeline extends readonly PipelineItem[]>(
    pipeline: TPipeline,
  ) =>
    Object.freeze({
      kind: 'layer' as const,
      name: descriptor.name,
      role: descriptor.role,
      requires: descriptor.requires,
      provides: descriptor.provides,
      requiresValidated: descriptor.requiresValidated,
      shortCircuits: descriptor.shortCircuits,
      definition: descriptor,
      pipeline,
    })
  Object.defineProperty(callable, 'name', {
    value: definition.name,
    enumerable: true,
    configurable: true,
  })
  descriptor = Object.assign(callable, {
    kind: 'layer' as const,
    role: definition.role ?? ('generic' as TRole),
    requires: definition.requires ?? ([] as unknown as TRequires),
    provides: definition.provides ?? ([] as unknown as TProvides),
    requiresValidated:
      definition.requiresValidated ?? ([] as unknown as TRequiresValidated),
    shortCircuits:
      definition.shortCircuits ?? ([] as unknown as TShortCircuits),
    factory: definition.factory,
  }) as unknown as LayerDescriptor<
    TRequires,
    TProvides,
    TShortCircuitResult,
    TShortCircuits,
    TName,
    TRole,
    TRequiresValidated,
    TContext
  >
  return Object.freeze(descriptor)
}
