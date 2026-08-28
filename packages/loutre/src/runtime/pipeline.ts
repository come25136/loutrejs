import {
  childPipelineOf,
  contextKeyName,
  isShortCircuit,
  layerDefinitionOf,
  type ContextKey,
  type LayerDescriptor,
  type LayerRuntime,
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
  readonly layer: (
    descriptor: LayerDescriptor,
  ) => LayerRuntime<object, readonly [], unknown>
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
  const context = hooks.context as TContext & Record<string, unknown>
  const flow = await executeSegment(
    pipeline,
    0,
    hooks,
    context,
    new Set<ContextKey>(),
  )
  if (flow.kind === 'continue') {
    throw new Error('Pipelineがresultを生成しませんでした')
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
  runtime: LayerRuntime<object, readonly [], unknown>,
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
        `LUTRE_LAYER_NEXT_REENTRY: Layer ${layer.name}のnext()は1回だけ実行できます`,
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
        `LUTRE_LAYER_SHORT_CIRCUIT_AFTER_NEXT: Layer ${layer.name}はnext()後にshortCircuitできません`,
      )
    }
    return {
      kind: 'complete',
      result: runtimeResult.result as TResult,
    }
  }
  if (calls === 0) {
    throw new LayerContractError(
      `LUTRE_LAYER_NEXT_SKIPPED: Layer ${layer.name}はnext()を1回実行する必要があります`,
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
        `${layerName}が必要とするContext Key ${contextKeyName(required)}は利用できません`,
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
      `${layer.name}のnext()へ渡せるContext objectは1つだけです`,
    )
  }
  if (layer.provides.length === 0) {
    if (arguments_.length > 0) {
      const provided = arguments_[0]
      const property = firstProperty(provided)
      throw new LayerContractError(
        property === undefined
          ? `${layer.name}はContextをprovideすると宣言していません`
          : `${layer.name}が未宣言のContext property ${property}をprovideしました`,
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
      `${layer.name}はprovidesで宣言したContextをnext(object)で渡す必要があります`,
    )
  }

  const additions = provided as Record<string, unknown>
  const declaredNames = new Set(layer.provides.map((key) => key.name))
  for (const property of Object.keys(additions)) {
    if (!declaredNames.has(property)) {
      throw new LayerContractError(
        `${layer.name}が未宣言のContext property ${property}をprovideしました`,
      )
    }
  }
  const providedNames = new Set<string>()
  for (const key of layer.provides) {
    if (providedNames.has(key.name)) {
      throw new LayerContractError(
        `${layer.name}がContext property ${key.name}を重複して宣言しました`,
      )
    }
    providedNames.add(key.name)
    if (!Object.hasOwn(additions, key.name)) {
      throw new LayerContractError(
        `${layer.name}が宣言したContext Key ${contextKeyName(key)}をprovideしませんでした`,
      )
    }
    if (Object.hasOwn(context, key.name)) {
      throw new LayerContractError(
        `${layer.name}は既存のContext property ${key.name}を上書きできません`,
      )
    }
  }
  Object.assign(context, additions)
  for (const key of layer.provides) availableKeys.add(key)
}

function firstProperty(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }
  return Object.keys(value)[0]
}
