import type { RuntimeCapability } from './extension.js'
import type { TokenLike, TokenValue } from './token.js'

export interface GenericLayerContext<TState extends object = {}> {
  readonly state: Readonly<TState>
}

export type GenericLayerNext<
  TContribution extends object,
  TOutcome,
> = keyof TContribution extends never
  ? () => Promise<TOutcome>
  : (contribution: TContribution) => Promise<TOutcome>

export interface GenericLayer<
  TContext extends object = object,
  TContribution extends object = {},
  TOutcome = unknown,
  TInject extends readonly TokenLike[] = readonly TokenLike[],
> {
  readonly kind: 'generic-layer'
  readonly name: string
  readonly inject: TInject
  readonly capabilities: readonly RuntimeCapability[]
  readonly factory: (
    ...dependencies: { [K in keyof TInject]: TokenValue<TInject[K]> }
  ) => (
    context: TContext & GenericLayerContext,
    next: GenericLayerNext<TContribution, TOutcome>,
  ) => Promise<TOutcome>
}

export function defineLayer<
  TContext extends object = object,
  TContribution extends object = {},
  TOutcome = unknown,
  const TInject extends readonly TokenLike[] = readonly [],
>(declaration: {
  readonly name: string
  readonly inject?: TInject
  readonly capabilities?: readonly RuntimeCapability[]
  readonly factory: GenericLayer<
    TContext,
    TContribution,
    TOutcome,
    TInject
  >['factory']
}): GenericLayer<TContext, TContribution, TOutcome, TInject> {
  return Object.freeze({
    kind: 'generic-layer',
    name: declaration.name,
    inject: declaration.inject ?? ([] as unknown as TInject),
    capabilities: declaration.capabilities ?? [],
    factory: declaration.factory,
  })
}

export function composeLayers<TContext extends object, TOutcome>(options: {
  readonly context: TContext
  readonly layers: readonly GenericLayer<any, any, TOutcome, any>[]
  readonly resolve: <TValue>(token: TokenLike<TValue>) => TValue
  readonly terminal: (
    context: TContext & GenericLayerContext<Record<string, unknown>>,
  ) => Promise<TOutcome>
}): Promise<TOutcome> {
  const runtimes = options.layers.map((layer) =>
    layer.factory(
      ...layer.inject.map((token: TokenLike) => options.resolve(token)),
    ),
  )
  const dispatch = (
    index: number,
    state: Readonly<Record<string, unknown>>,
  ): Promise<TOutcome> => {
    const context = Object.assign(Object.create(options.context), {
      state: Object.freeze({ ...state }),
    }) as TContext & GenericLayerContext
    const runtime = runtimes[index]
    if (!runtime) return options.terminal(context)
    let called = false
    return runtime(context, async (contribution: object = {}) => {
      if (called) {
        throw new Error('LUTRE_LAYER_NEXT_MULTIPLE: next() can be called once.')
      }
      called = true
      return dispatch(index + 1, { ...state, ...contribution })
    })
  }
  return dispatch(0, {})
}
