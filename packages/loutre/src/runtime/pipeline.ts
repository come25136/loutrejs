import {
  childPipelineOf,
  isShortCircuit,
  layerDefinitionOf,
  type LayerDependency,
  type LayerDescriptor,
  type PipelineItem,
  type TerminalLayerDescriptor,
  type ValidationLayerDescriptor,
} from '../core/index.js'

export interface PipelineHooks<TContext extends object, TResult> {
  readonly context: TContext
  readonly validate: (
    layer: ValidationLayerDescriptor,
    context: TContext,
  ) => void | Promise<void>
  readonly terminal: (
    layer: TerminalLayerDescriptor,
    context: TContext,
  ) => TResult | Promise<TResult>
  readonly layer: (descriptor: LayerDescriptor) => ExecutableLayerRuntime
}

type ExecutableLayerRuntime = (
  context: object,
  next: (...arguments_: readonly unknown[]) => Promise<void>,
) => Promise<unknown>

type RuntimeContext = Record<string, unknown> & {
  state: Record<string, unknown>
}

type PipelineFlow<TResult> =
  | { readonly kind: 'continue' }
  | { readonly kind: 'complete'; readonly result: TResult }

export class LayerContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LayerContractError'
  }
}

export async function executePipeline<TContext extends object, TResult>(
  pipeline: readonly PipelineItem[],
  hooks: PipelineHooks<TContext, TResult>,
): Promise<TResult> {
  const context = ensureRuntimeContext(hooks.context)
  const flow = await executeSegment(
    pipeline,
    0,
    hooks,
    context,
    new Set<LayerDependency>(),
  )
  if (flow.kind === 'continue') {
    throw new Error('Pipeline did not produce a result')
  }
  return flow.result
}

async function executeSegment<TContext extends object, TResult>(
  pipeline: readonly PipelineItem[],
  index: number,
  hooks: PipelineHooks<TContext, TResult>,
  context: RuntimeContext,
  availableLayers: Set<LayerDependency>,
): Promise<PipelineFlow<TResult>> {
  const item = pipeline[index]
  if (!item) return { kind: 'continue' }

  if (item.kind === 'validation') {
    await hooks.validate(item, context as unknown as TContext)
    return executeSegment(pipeline, index + 1, hooks, context, availableLayers)
  }
  if (item.kind === 'terminal') {
    return {
      kind: 'complete',
      result: await hooks.terminal(item, context as unknown as TContext),
    }
  }

  const definition = layerDefinitionOf(item)
  assertRequiredLayers(definition.name, definition.requires, availableLayers)
  const child = childPipelineOf(item)
  const continuation =
    child === undefined
      ? () =>
          executeSegment(pipeline, index + 1, hooks, context, availableLayers)
      : () => executeSegment(child, 0, hooks, context, availableLayers)
  const flow = await executeLayer(
    definition,
    hooks.layer(definition),
    continuation,
    context,
    availableLayers,
  )

  if (flow.kind === 'complete' || child === undefined) return flow
  return executeSegment(pipeline, index + 1, hooks, context, availableLayers)
}

async function executeLayer<TResult>(
  layer: LayerDescriptor,
  runtime: ExecutableLayerRuntime,
  continuation: () => Promise<PipelineFlow<TResult>>,
  context: RuntimeContext,
  availableLayers: Set<LayerDependency>,
): Promise<PipelineFlow<TResult>> {
  let calls = 0
  let continuationFlow: PipelineFlow<TResult> = { kind: 'continue' }
  let continuationFailed = false
  let continuationError: unknown
  let contractError: LayerContractError | undefined
  let completion: Promise<void> | undefined

  const next = (...arguments_: readonly unknown[]): Promise<void> => {
    calls += 1
    if (calls > 1) {
      contractError = new LayerContractError(
        `LUTRE_LAYER_NEXT_REENTRY: Layer ${layer.name} can call next() only once`,
      )
      return Promise.reject(contractError)
    }

    applyStateContribution(layer, context.state, arguments_)
    availableLayers.add(layer)

    completion = (async () => {
      try {
        continuationFlow = await continuation()
      } catch (error) {
        continuationFailed = true
        continuationError = error
        throw error
      }
    })()
    return completion
  }

  let runtimeResult: unknown
  let runtimeError: unknown
  let runtimeFailed = false
  try {
    runtimeResult = await Reflect.apply(runtime, undefined, [context, next])
  } catch (error) {
    runtimeFailed = true
    runtimeError = error
  }

  if (completion) {
    try {
      await completion
    } catch {
      // continuation failureはLayerが握り潰しても下で元の値を再throwする。
    }
  }
  if (continuationFailed) throw continuationError
  if (contractError) throw contractError
  if (runtimeFailed) throw runtimeError

  if (isShortCircuit(runtimeResult)) {
    if (calls > 0) {
      throw new LayerContractError(
        `LUTRE_LAYER_SHORT_CIRCUIT_AFTER_NEXT: Layer ${layer.name} cannot shortCircuit after next()`,
      )
    }
    return {
      kind: 'complete',
      result: runtimeResult.result as TResult,
    }
  }
  if (calls === 0) {
    throw new LayerContractError(
      `LUTRE_LAYER_NEXT_SKIPPED: Layer ${layer.name} must call next() exactly once`,
    )
  }
  return continuationFlow
}

function ensureRuntimeContext<TContext extends object>(
  context: TContext,
): RuntimeContext {
  const candidate = context as Record<string, unknown>
  if (!Object.hasOwn(candidate, 'state')) {
    candidate.state = {}
  }
  if (!isPlainObject(candidate.state)) {
    throw new LayerContractError(
      'Pipeline Context state must be a plain object',
    )
  }
  return candidate as RuntimeContext
}

function assertRequiredLayers(
  layerName: string,
  requiredLayers: readonly LayerDependency[],
  availableLayers: ReadonlySet<LayerDependency>,
): void {
  for (const required of requiredLayers) {
    if (!availableLayers.has(required)) {
      throw new LayerContractError(
        `Layer ${required.name} required by ${layerName} is unavailable`,
      )
    }
  }
}

function applyStateContribution(
  layer: LayerDescriptor,
  state: Record<string, unknown>,
  arguments_: readonly unknown[],
): void {
  if (arguments_.length > 1) {
    throw new LayerContractError(
      `Layer ${layer.name} can pass only one State contribution to next()`,
    )
  }
  if (arguments_.length === 0) return

  const contribution = arguments_[0]
  if (!isPlainObject(contribution)) {
    throw new LayerContractError(
      `Layer ${layer.name} must pass a plain State contribution to next()`,
    )
  }

  for (const [namespace, payload] of Object.entries(contribution)) {
    if (namespace === '__proto__') {
      throw new LayerContractError(
        `Layer ${layer.name} cannot contribute reserved State namespace ${namespace}`,
      )
    }

    if (!Object.hasOwn(state, namespace)) {
      state[namespace] = payload
      continue
    }

    const current = state[namespace]
    if (!isPlainObject(current) || !isPlainObject(payload)) {
      throw new LayerContractError(
        `Layer ${layer.name} cannot overwrite existing State namespace ${namespace}`,
      )
    }

    for (const key of Object.keys(payload)) {
      if (Object.hasOwn(current, key)) {
        throw new LayerContractError(
          `Layer ${layer.name} cannot overwrite existing State property ${namespace}.${key}`,
        )
      }
    }

    state[namespace] = { ...current, ...payload }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
