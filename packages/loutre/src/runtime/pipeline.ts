import {
  childPipelineOf,
  contextKeyName,
  isShortCircuit,
  layerDefinitionOf,
  type ContextKey,
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
  const context = hooks.context as TContext & Record<string, unknown>
  const flow = await executeSegment(
    pipeline,
    0,
    hooks,
    context,
    new Set<ContextKey>(),
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
  context: TContext & Record<string, unknown>,
  availableKeys: Set<ContextKey>,
): Promise<PipelineFlow<TResult>> {
  const item = pipeline[index]
  if (!item) return { kind: 'continue' }

  if (item.kind === 'validation') {
    await hooks.validate(item, context)
    return executeSegment(pipeline, index + 1, hooks, context, availableKeys)
  }
  if (item.kind === 'terminal') {
    return {
      kind: 'complete',
      result: await hooks.terminal(item, context),
    }
  }

  const definition = layerDefinitionOf(item)
  assertRequiredContext(definition.name, definition.requires, availableKeys)
  const child = childPipelineOf(item)
  const continuation =
    child === undefined
      ? () => executeSegment(pipeline, index + 1, hooks, context, availableKeys)
      : () => executeSegment(child, 0, hooks, context, availableKeys)
  const flow = await executeLayer(
    definition,
    hooks.layer(definition),
    continuation,
    context,
    availableKeys,
  )

  if (flow.kind === 'complete' || child === undefined) return flow
  return executeSegment(pipeline, index + 1, hooks, context, availableKeys)
}

async function executeLayer<TResult>(
  layer: LayerDescriptor,
  runtime: ExecutableLayerRuntime,
  continuation: () => Promise<PipelineFlow<TResult>>,
  context: Record<string, unknown>,
  availableKeys: Set<ContextKey>,
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

    applyProvidedContext(layer, context, availableKeys, arguments_)
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

function assertRequiredContext(
  layerName: string,
  requiredKeys: readonly ContextKey[],
  availableKeys: ReadonlySet<ContextKey>,
): void {
  for (const required of requiredKeys) {
    if (!availableKeys.has(required)) {
      throw new LayerContractError(
        `Context Key ${contextKeyName(required)} required by ${layerName} is unavailable`,
      )
    }
  }
}

function applyProvidedContext(
  layer: LayerDescriptor,
  context: Record<string, unknown>,
  availableKeys: Set<ContextKey>,
  arguments_: readonly unknown[],
): void {
  if (arguments_.length > 1) {
    throw new LayerContractError(
      `Layer ${layer.name} can pass only one Context object to next()`,
    )
  }
  if (!layer.provide) {
    if (arguments_.length > 0) {
      const property = firstProperty(arguments_[0])
      throw new LayerContractError(
        property === undefined
          ? `Layer ${layer.name} does not declare any provided Context`
          : `Layer ${layer.name} provided undeclared Context property ${property}`,
      )
    }
    return
  }

  const provided = arguments_[0]
  if (
    typeof provided !== 'object' ||
    provided === null ||
    Array.isArray(provided)
  ) {
    throw new LayerContractError(
      `Layer ${layer.name} must pass its declared Context to next(object)`,
    )
  }

  const additions = provided as Record<string, unknown>
  for (const property of Object.keys(additions)) {
    if (property !== layer.provide.name) {
      throw new LayerContractError(
        `Layer ${layer.name} provided undeclared Context property ${property}`,
      )
    }
  }
  if (!Object.hasOwn(additions, layer.provide.name)) {
    throw new LayerContractError(
      `Layer ${layer.name} did not provide declared Context Key ${contextKeyName(layer.provide)}`,
    )
  }
  if (Object.hasOwn(context, layer.provide.name)) {
    throw new LayerContractError(
      `Layer ${layer.name} cannot overwrite existing Context property ${layer.provide.name}`,
    )
  }

  Object.assign(context, additions)
  availableKeys.add(layer.provide)
}

function firstProperty(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }
  return Object.keys(value)[0]
}
