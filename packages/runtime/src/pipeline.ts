import {
  contextKeyName,
  isShortCircuit,
  type ContextKey,
  type ExecutionScope,
  type LayerDescriptor,
  type LayerInjection,
  type Outcome,
  type PipelineItem,
  type TerminalLayerDescriptor,
  type TokenLike,
  type ValidationLayerDescriptor,
} from '@loutrejs/core'

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
  readonly resolve?: <T>(token: TokenLike<T>) => T
}

interface EnteredLayer<TContext extends object> {
  readonly layer: LayerDescriptor
  readonly context: TContext
  readonly state: unknown
}

type PipelineFlow<TResult> =
  | { readonly kind: 'continue' }
  | { readonly kind: 'complete', readonly result: TResult }

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
  hooks: PipelineHooks<TContext, TResult>,
  context: TContext & Record<string, unknown>,
  availableKeys: Set<ContextKey>,
): Promise<PipelineFlow<TResult>> {
  const entered: EnteredLayer<TContext>[] = []
  let flow: PipelineFlow<TResult> = { kind: 'continue' }
  let outcome: Outcome<TResult>

  try {
    for (const item of pipeline) {
      if (item.kind === 'validation') {
        await hooks.validate(item, context)
        continue
      }
      if (item.kind === 'terminal') {
        flow = {
          kind: 'complete',
          result: await hooks.terminal(item, context),
        }
        break
      }

      assertRequiredContext(item.name, item.requires, availableKeys)

      if (item.composition === 'pipeline') {
        flow = await executeComposite(
          item.scope,
          item.inject,
          item.pipeline,
          hooks,
          context,
          availableKeys,
        )
        if (flow.kind === 'complete') break
        continue
      }

      const inboundResult = await item.inbound?.(context)
      if (isShortCircuit(inboundResult)) {
        entered.push({
          layer: item,
          context,
          state: inboundResult.state,
        })
        flow = {
          kind: 'complete',
          result: inboundResult.result as TResult,
        }
        break
      }

      const state = applyProvidedContext(
        item,
        context,
        availableKeys,
        inboundResult,
      )
      entered.push({ layer: item, context, state })
    }

    outcome = flow.kind === 'complete'
      ? { ok: true, value: flow.result }
      : { ok: true }
  } catch (error) {
    outcome = { ok: false, error }
  }

  for (const enteredLayer of entered.reverse()) {
    try {
      await callOutbound(enteredLayer, outcome)
    } catch (error) {
      outcome = { ok: false, error }
    }
  }

  if (!outcome.ok) throw outcome.error
  return flow
}

async function executeComposite<TContext extends object, TResult>(
  createScope: (...arguments_: never[]) => ExecutionScope,
  injections: readonly LayerInjection[],
  pipeline: readonly PipelineItem[],
  hooks: PipelineHooks<TContext, TResult>,
  context: TContext & Record<string, unknown>,
  availableKeys: Set<ContextKey>,
): Promise<PipelineFlow<TResult>> {
  const dependencies = injections.map((injection) => {
    const token = isLayerDependency(injection) ? injection.token : injection
    if (!hooks.resolve) {
      throw new LayerContractError(
        `Composite Layer dependency ${tokenDescription(token)}を解決できません`,
      )
    }
    return hooks.resolve(token)
  })
  const scope = Reflect.apply(createScope, undefined, [context, ...dependencies]) as ExecutionScope
  let calls = 0
  let childFlow: PipelineFlow<TResult> = { kind: 'continue' }
  let childError: unknown
  let childFailed = false
  let childCompletion: Promise<void> | undefined

  const execute = (): Promise<void> => {
    calls += 1
    if (calls > 1) {
      throw new LayerContractError(
        'LUTRE_LAYER_SCOPE_REENTRY: Composite Layer scope callbackは1回だけ実行できます',
      )
    }
    childCompletion = (async () => {
      try {
        childFlow = await executeSegment(
          pipeline,
          hooks,
          context,
          availableKeys,
        )
      } catch (error) {
        childFailed = true
        childError = error
        throw error
      }
    })()
    return childCompletion
  }

  let scopeError: unknown
  try {
    await scope.run(execute)
  } catch (error) {
    scopeError = error
  }

  if (calls === 0) {
    throw new LayerContractError(
      'LUTRE_LAYER_SCOPE_SKIPPED: Composite Layer scope callbackが実行されませんでした',
    )
  }
  if (calls > 1) {
    throw new LayerContractError(
      'LUTRE_LAYER_SCOPE_REENTRY: Composite Layer scope callbackは1回だけ実行できます',
    )
  }

  if (childCompletion) {
    try {
      await childCompletion
    } catch {
      // child errorは下で元の値を再throwする。
    }
  }
  if (childFailed) throw childError
  if (scopeError !== undefined) throw scopeError
  return childFlow
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

function isLayerDependency(
  injection: LayerInjection,
): injection is Exclude<LayerInjection, TokenLike> {
  return typeof injection === 'object' && 'token' in injection
}

function tokenDescription(token: TokenLike): string {
  return typeof token === 'function' ? token.name : token.id
}

async function callOutbound<TContext extends object>(
  entered: EnteredLayer<TContext>,
  outcome: Outcome,
): Promise<void> {
  if (!entered.layer.outbound) return
  await Reflect.apply(entered.layer.outbound, undefined, [
    entered.context,
    outcome,
    entered.state,
  ])
}

function applyProvidedContext(
  layer: LayerDescriptor,
  context: Record<string, unknown>,
  availableKeys: Set<ContextKey>,
  result: unknown,
): unknown {
  if (layer.provides.length === 0) return result
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new LayerContractError(
      `${layer.name}はprovidesで宣言したContextをobjectとして返す必要があります`,
    )
  }

  const additions = result as Record<string, unknown>
  const declaredNames = new Set(layer.provides.map((key) => key.name))
  for (const property of Object.keys(additions)) {
    if (!declaredNames.has(property)) {
      throw new LayerContractError(
        `${layer.name}が未宣言のContext property ${property}を返しました`,
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
        `${layer.name}が宣言したContext Key ${contextKeyName(key)}を返しませんでした`,
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
  return additions
}
