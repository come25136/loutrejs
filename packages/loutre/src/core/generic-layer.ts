import type { RuntimeCapability } from './extension.js'
import { runInInjectionContext } from './injection.js'
import type { TokenLike } from './token.js'
import type { Type } from './type.js'

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
> {
  readonly kind: 'generic-layer'
  readonly state?: Type<TContribution>
  readonly name: string
  readonly capabilities: readonly RuntimeCapability[]
  readonly factory: () => (
    context: TContext & GenericLayerContext,
    next: GenericLayerNext<TContribution, TOutcome>,
  ) => Promise<TOutcome>
}

export function defineLayer<
  TContext extends object = object,
  TContribution extends object = {},
  TOutcome = unknown,
>(declaration: {
  readonly name: string
  readonly state?: Type<TContribution>
  readonly capabilities?: readonly RuntimeCapability[]
  readonly factory: GenericLayer<TContext, TContribution, TOutcome>['factory']
}): GenericLayer<TContext, TContribution, TOutcome> {
  return Object.freeze({
    kind: 'generic-layer',
    ...(declaration.state === undefined ? {} : { state: declaration.state }),
    name: declaration.name,
    capabilities: declaration.capabilities ?? [],
    factory: declaration.factory,
  })
}

export function composeLayers<TContext extends object, TOutcome>(options: {
  readonly context: TContext
  readonly layers: readonly GenericLayer<any, any, TOutcome>[]
  readonly resolve: <TValue>(token: TokenLike<TValue>) => TValue
  readonly terminal: (
    context: TContext & GenericLayerContext<Record<string, unknown>>,
  ) => Promise<TOutcome>
}): Promise<TOutcome> {
  const runtimes = options.layers.map((layer, index) =>
    runInInjectionContext(
      {
        consumer: {
          kind: 'layer-consumer',
          id: `layer:${index}:${layer.name}`,
          name: layer.name,
        },
        resolve: options.resolve,
      },
      () => layer.factory(),
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
