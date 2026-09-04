import type { Type, TypeOf } from './type.js'

export type ValidatedInputPart = 'params' | 'query' | 'headers' | 'body'

const shortCircuitMarker = Symbol('loutre.short-circuit')

const layerDependencyBrand = Symbol.for('loutre.layer-dependency')

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

export interface ShortCircuitDeclaration {
  readonly protocol: string
  readonly response: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface LayerContext<TState extends object = {}> {
  readonly state: Readonly<TState>
}

export interface LayerDependency {
  readonly kind: 'layer'
  readonly name: string
  readonly requires: readonly LayerDependency[]
  readonly requiresValidated: readonly ValidatedInputPart[]
  readonly [layerDependencyBrand]: true
}

export type LayerContributionOf<TLayer extends LayerDependency> =
  TLayer extends {
    readonly factory: LayerFactory<any, any, infer TContribution, any>
  }
    ? TContribution
    : TLayer extends {
          readonly definition: infer TDefinition extends LayerDependency
        }
      ? LayerContributionOf<TDefinition>
      : never

export type StateAfter<TLayer extends LayerDependency> = StateFromLayers<
  TLayer['requires']
> &
  LayerContributionOf<TLayer>

export type StateFromLayers<TLayers extends readonly LayerDependency[]> =
  number extends TLayers['length']
    ? {}
    : TLayers extends readonly [
          infer THead extends LayerDependency,
          ...infer TTail extends readonly LayerDependency[],
        ]
      ? StateAfter<THead> & StateFromLayers<TTail>
      : {}

export type LayerNext<TContribution extends object> =
  keyof TContribution extends never
    ? () => Promise<void>
    : (contribution: TContribution) => Promise<void>

export type LayerRuntime<
  TContext extends object,
  TRequires extends readonly LayerDependency[],
  TContribution extends object,
  TShortCircuitResult,
> = (
  context: TContext & LayerContext<StateFromLayers<TRequires>>,
  next: LayerNext<TContribution>,
) => Promise<void | ShortCircuit<TShortCircuitResult>>

export type LayerFactory<
  TContext extends object,
  TRequires extends readonly LayerDependency[],
  TContribution extends object,
  TShortCircuitResult,
> = () => LayerRuntime<TContext, TRequires, TContribution, TShortCircuitResult>

const runtimeShortCircuits = new WeakMap<
  object,
  readonly ShortCircuitDeclaration[]
>()

export function registerLayerShortCircuits(
  descriptor: object,
  declarations: readonly ShortCircuitDeclaration[],
): void {
  runtimeShortCircuits.set(descriptor, Object.freeze([...declarations]))
}

export function shortCircuitsOfLayer(
  descriptor: LayerDescriptor,
): readonly ShortCircuitDeclaration[] {
  const runtime = runtimeShortCircuits.get(descriptor)
  return runtime === undefined
    ? descriptor.shortCircuits
    : [...descriptor.shortCircuits, ...runtime]
}

export interface LayerDeclaration<
  TState extends Type<object> = Type<{}>,
  TRequires extends readonly LayerDependency[] = readonly [],
  TShortCircuits extends readonly ShortCircuitDeclaration[] = readonly [],
  TName extends string = string,
  TRequiresValidated extends readonly ValidatedInputPart[] = readonly [],
  TContext extends object = {},
  TResult = never,
> {
  readonly name: TName
  readonly state?: TState
  readonly requires?: TRequires
  readonly requiresValidated?: TRequiresValidated
  readonly shortCircuits?: TShortCircuits
  readonly context?: Type<TContext>
  readonly result?: Type<TResult>
  readonly factory: LayerFactory<TContext, TRequires, TypeOf<TState>, TResult>
}

export interface LayerOccurrenceDescriptor<
  TContribution extends object = object,
  TRequires extends readonly LayerDependency[] = readonly LayerDependency[],
  TShortCircuitResult = unknown,
  TShortCircuits extends readonly ShortCircuitDeclaration[] =
    readonly ShortCircuitDeclaration[],
  TName extends string = string,
  TRequiresValidated extends readonly ValidatedInputPart[] =
    readonly ValidatedInputPart[],
  TContext extends object = object,
  TPipeline extends readonly PipelineItem[] = readonly PipelineItem[],
> {
  readonly kind: 'layer'
  readonly name: TName
  readonly requires: TRequires
  readonly requiresValidated: TRequiresValidated
  readonly shortCircuits: TShortCircuits
  readonly definition: LayerDescriptor<
    TContribution,
    TRequires,
    TShortCircuitResult,
    TShortCircuits,
    TName,
    TRequiresValidated,
    TContext
  >
  readonly pipeline: TPipeline
  readonly factory?: never
  readonly [layerDependencyBrand]: true
}

export interface LayerDescriptor<
  TContribution extends object = object,
  TRequires extends readonly LayerDependency[] = readonly LayerDependency[],
  TShortCircuitResult = unknown,
  TShortCircuits extends readonly ShortCircuitDeclaration[] =
    readonly ShortCircuitDeclaration[],
  TName extends string = string,
  TRequiresValidated extends readonly ValidatedInputPart[] =
    readonly ValidatedInputPart[],
  TContext extends object = object,
> {
  <const TPipeline extends readonly PipelineItem[]>(
    pipeline: TPipeline,
  ): LayerOccurrenceDescriptor<
    TContribution,
    TRequires,
    TShortCircuitResult,
    TShortCircuits,
    TName,
    TRequiresValidated,
    TContext,
    TPipeline
  >
  readonly kind: 'layer'
  readonly name: TName
  readonly requires: TRequires
  readonly requiresValidated: TRequiresValidated
  readonly shortCircuits: TShortCircuits
  readonly factory: LayerFactory<
    TContext,
    TRequires,
    TContribution,
    TShortCircuitResult
  >
  readonly definition?: never
  readonly pipeline?: never
  readonly [layerDependencyBrand]: true
}

export interface ValidationLayerDescriptor {
  readonly kind: 'validation'
  readonly name: `validate.${'params' | 'query' | 'headers' | 'body'}`
  readonly part: 'params' | 'query' | 'headers' | 'body'
}

export interface TerminalLayerDescriptor<TProtocol extends string = string> {
  readonly kind: 'terminal'
  readonly name: `${TProtocol}.${string}`
  readonly protocol: TProtocol
}

type AnyLayerDescriptor = LayerDescriptor<any, any, any, any, any, any, any>
type AnyLayerOccurrence = LayerOccurrenceDescriptor<
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

function isLayerDependency(
  item: PipelineItem,
): item is AnyLayerDescriptor | AnyLayerOccurrence {
  return (
    item.kind === 'layer' &&
    layerDependencyBrand in item &&
    item[layerDependencyBrand] === true
  )
}

export function isLayerOccurrence(
  item: PipelineItem,
): item is AnyLayerOccurrence {
  return isLayerDependency(item) && item.definition !== undefined
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
          infer TPipeline
        >
      ? FoldPipelineTerminals<TPipeline, TProtocol, TState>
      : TState

type AreRequiredLayersAvailable<
  TRequires extends readonly LayerDependency[],
  TAvailable extends LayerDependency,
> = [TRequires[number]] extends [never]
  ? true
  : false extends (
        TRequires[number] extends infer TRequired extends LayerDependency
          ? TRequired extends TAvailable
            ? true
            : false
          : never
      )
    ? false
    : true

type AreRequiredValidatedPartsAvailable<
  TRequires extends readonly ValidatedInputPart[],
  TValidated extends ValidatedInputPart,
> = Exclude<TRequires[number], TValidated> extends never ? true : false

interface PipelineRequirementState<
  TAvailable extends LayerDependency,
  TValidated extends ValidatedInputPart,
  TValid extends boolean,
> {
  readonly available: TAvailable
  readonly validated: TValidated
  readonly valid: TValid
}

type InvalidPipelineRequirementState = PipelineRequirementState<
  LayerDependency,
  ValidatedInputPart,
  false
>

type FoldLayerRequirements<
  TLayer extends LayerDependency,
  TState extends PipelineRequirementState<
    LayerDependency,
    ValidatedInputPart,
    boolean
  >,
> = TState['valid'] extends false
  ? TState
  : AreRequiredLayersAvailable<
        TLayer['requires'],
        TState['available']
      > extends true
    ? AreRequiredValidatedPartsAvailable<
        TLayer['requiresValidated'],
        TState['validated']
      > extends true
      ? PipelineRequirementState<
          TState['available'] | TLayer,
          TState['validated'],
          true
        >
      : InvalidPipelineRequirementState
    : InvalidPipelineRequirementState

type FoldPipelineRequirements<
  TPipeline extends readonly PipelineItem[],
  TState extends PipelineRequirementState<
    LayerDependency,
    ValidatedInputPart,
    boolean
  >,
> = TState['valid'] extends false
  ? TState
  : number extends TPipeline['length']
    ? TState
    : TPipeline extends readonly [infer THead, ...infer TTail]
      ? FoldPipelineRequirements<
          Extract<TTail, readonly PipelineItem[]>,
          FoldPipelineItemRequirements<THead, TState>
        >
      : TState

type FoldPipelineItemRequirements<
  TItem,
  TState extends PipelineRequirementState<
    LayerDependency,
    ValidatedInputPart,
    boolean
  >,
> = TItem extends ValidationLayerDescriptor
  ? PipelineRequirementState<
      TState['available'],
      TState['validated'] | TItem['part'],
      TState['valid']
    >
  : TItem extends LayerOccurrenceDescriptor<
        any,
        any,
        any,
        any,
        any,
        any,
        any,
        infer TPipeline
      >
    ? FoldPipelineRequirements<
        TPipeline,
        FoldLayerRequirements<TItem['definition'], TState>
      >
    : TItem extends LayerDependency
      ? FoldLayerRequirements<TItem, TState>
      : TState

type IsPipelineRequirementsValid<TPipeline extends readonly PipelineItem[]> =
  FoldPipelineRequirements<
    TPipeline,
    PipelineRequirementState<never, never, true>
  >['valid'] extends true
    ? true
    : false

export type IsValidProtocolPipeline<
  TPipeline extends readonly PipelineItem[],
  TProtocol extends string,
> =
  FoldPipelineTerminals<
    TPipeline,
    TProtocol,
    PipelineTerminalState<false, true>
  > extends PipelineTerminalState<true, true>
    ? IsPipelineRequirementsValid<TPipeline>
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
    infer TPipeline
  >
    ? ShortCircuitResultOfPipeline<TPipeline> | ShortCircuitResultOfLayer<TItem>
    : ShortCircuitResultOfLayer<TItem>

type ShortCircuitResultOfLayer<TItem> = TItem extends {
  readonly factory: LayerFactory<any, any, any, infer TResult>
}
  ? TResult
  : TItem extends {
        readonly definition: infer TDefinition extends LayerDependency
      }
    ? ShortCircuitResultOfLayer<TDefinition>
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
  TState extends object,
  TValidated extends ValidatedInputPart,
  TDone extends boolean,
> {
  readonly state: TState
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
  ? PipelineTypeState<TState['state'], TState['validated'], true>
  : TItem extends ValidationLayerDescriptor
    ? PipelineTypeState<
        TState['state'],
        TState['validated'] | TItem['part'],
        false
      >
    : TItem extends LayerOccurrenceDescriptor<
          any,
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
            TState['state'] & LayerContributionOf<TItem['definition']>,
            TState['validated'],
            false
          >
        >
      : TItem extends LayerDependency
        ? PipelineTypeState<
            TState['state'] & LayerContributionOf<TItem>,
            TState['validated'],
            false
          >
        : TState

export type StateProvidedBeforeTerminal<
  TPipeline extends readonly PipelineItem[],
  TState extends object = {},
> = number extends TPipeline['length']
  ? TState
  : FoldPipeline<TPipeline, PipelineTypeState<TState, never, false>>['state']

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

type DuplicateValidatedInputParts<
  TParts extends readonly ValidatedInputPart[],
  TSeen extends ValidatedInputPart = never,
> = number extends TParts['length']
  ? never
  : TParts extends readonly [
        infer THead extends ValidatedInputPart,
        ...infer TTail extends readonly ValidatedInputPart[],
      ]
    ? THead extends TSeen
      ? THead | DuplicateValidatedInputParts<TTail, TSeen>
      : DuplicateValidatedInputParts<TTail, TSeen | THead>
    : never

type LayerDeclarationConstraint<
  TRequiresValidated extends readonly ValidatedInputPart[],
> = [DuplicateValidatedInputParts<TRequiresValidated>] extends [never]
  ? unknown
  : { readonly __invalidLayerDefinition__: never }

function assertLayerDeclaration(declaration: {
  readonly requires?: readonly LayerDependency[]
  readonly requiresValidated?: readonly ValidatedInputPart[]
}): void {
  const required = new Set<LayerDependency>()
  for (const dependency of declaration.requires ?? []) {
    if (required.has(dependency)) {
      throw new Error('Layer requires contains duplicate Layer')
    }
    required.add(dependency)
  }

  const validated = new Set<ValidatedInputPart>()
  for (const part of declaration.requiresValidated ?? []) {
    if (validated.has(part)) {
      throw new Error(`Layer requiresValidated contains duplicate part ${part}`)
    }
    validated.add(part)
  }
}

function setFunctionName<
  TFunction extends (...args: any[]) => unknown,
  const TName extends string,
>(fn: TFunction, name: TName): TFunction & { readonly name: TName } {
  Object.defineProperty(fn, 'name', {
    value: name,
    enumerable: true,
    configurable: true,
  })
  return fn as TFunction & { readonly name: TName }
}

export function layer<
  const TState extends Type<object> = Type<{}>,
  const TRequires extends readonly LayerDependency[] = readonly [],
  const TShortCircuits extends readonly ShortCircuitDeclaration[] = readonly [],
  const TName extends string = string,
  const TRequiresValidated extends readonly ValidatedInputPart[] = readonly [],
  TContext extends object = {},
  TResult = never,
>(
  declaration: LayerDeclaration<
    TState,
    TRequires,
    TShortCircuits,
    TName,
    TRequiresValidated,
    TContext,
    TResult
  > &
    LayerDeclarationConstraint<TRequiresValidated>,
): LayerDescriptor<
  TypeOf<TState>,
  TRequires,
  TResult,
  TShortCircuits,
  TName,
  TRequiresValidated,
  TContext
> {
  assertLayerDeclaration(declaration)

  let descriptor: LayerDescriptor<
    TypeOf<TState>,
    TRequires,
    TResult,
    TShortCircuits,
    TName,
    TRequiresValidated,
    TContext
  >

  const callable = setFunctionName(
    <const TPipeline extends readonly PipelineItem[]>(pipeline: TPipeline) =>
      Object.freeze({
        kind: 'layer' as const,
        name: descriptor.name,
        requires: descriptor.requires,
        requiresValidated: descriptor.requiresValidated,
        shortCircuits: descriptor.shortCircuits,
        definition: descriptor,
        pipeline,
        [layerDependencyBrand]: true as const,
      }),
    declaration.name,
  )

  descriptor = Object.assign(callable, {
    kind: 'layer' as const,
    requires: (declaration.requires ?? []) as TRequires,
    requiresValidated: (declaration.requiresValidated ??
      []) as TRequiresValidated,
    shortCircuits: (declaration.shortCircuits ?? []) as TShortCircuits,
    factory: declaration.factory,
    [layerDependencyBrand]: true as const,
  })

  return Object.freeze(descriptor)
}
