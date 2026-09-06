import type { RuntimeCapability } from './extension.js'
import { runInInjectionContext } from './injection.js'
import type { TokenLike } from './token.js'
import type { Type } from './type.js'

export interface GenericLayerContext<TState extends object = {}> {
  readonly state: Readonly<TState>
}

export type GenericLayerNext<TContribution extends object> =
  keyof TContribution extends never
    ? () => Promise<void>
    : (contribution: TContribution) => Promise<void>

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
    next: GenericLayerNext<TContribution>,
  ) => Promise<void | TOutcome>
}

export function defineLayer<
  TContribution extends object = {},
  TContext extends object = object,
  TOutcome = never,
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
  readonly resolve: <TValue>(
    token: TokenLike<TValue>,
    source?: string,
  ) => TValue
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
        resolve: (token) => options.resolve(token, layer.name),
      },
      () => layer.factory(),
    ),
  )
  const dispatch = async (
    index: number,
    state: Readonly<Record<string, unknown>>,
  ): Promise<TOutcome> => {
    const context = Object.assign(Object.create(options.context), {
      state: Object.freeze({ ...state }),
    }) as TContext & GenericLayerContext
    const runtime = runtimes[index]
    if (!runtime) return options.terminal(context)

    let called = false
    let continuationCompleted = false
    let continuationResult: TOutcome | undefined
    const runtimeResult = await runtime(
      context,
      async (contribution: object = {}) => {
        if (called) {
          throw new Error(
            'LUTRE_LAYER_NEXT_MULTIPLE: next() can be called once.',
          )
        }
        called = true
        continuationResult = await dispatch(
          index + 1,
          mergeStateContribution(
            options.layers[index]!.name,
            state,
            contribution,
          ),
        )
        continuationCompleted = true
      },
    )

    if (called && continuationCompleted) {
      return continuationResult as TOutcome
    }
    return runtimeResult as TOutcome
  }
  return dispatch(0, {})
}

function mergeStateContribution(
  layerName: string,
  state: Readonly<Record<string, unknown>>,
  contribution: unknown,
): Readonly<Record<string, unknown>> {
  if (!isPlainObject(contribution)) {
    throw new Error(
      `LUTRE_LAYER_STATE_INVALID: Layer ${layerName} must pass a plain State contribution to next().`,
    )
  }

  const nextState: Record<string, unknown> = { ...state }
  for (const [namespace, payload] of Object.entries(contribution)) {
    if (namespace === '__proto__') {
      throw new Error(
        `LUTRE_LAYER_STATE_RESERVED: Layer ${layerName} cannot contribute reserved State namespace ${namespace}.`,
      )
    }
    if (!Object.hasOwn(nextState, namespace)) {
      nextState[namespace] = payload
      continue
    }

    const current = nextState[namespace]
    if (!isPlainObject(current) || !isPlainObject(payload)) {
      throw new Error(
        `LUTRE_LAYER_STATE_OVERWRITE: Layer ${layerName} cannot overwrite existing State namespace ${namespace}.`,
      )
    }

    for (const key of Object.keys(payload)) {
      if (Object.hasOwn(current, key)) {
        throw new Error(
          `LUTRE_LAYER_STATE_OVERWRITE: Layer ${layerName} cannot overwrite existing State property ${namespace}.${key}.`,
        )
      }
    }
    nextState[namespace] = { ...current, ...payload }
  }
  return nextState
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
