import {
  contextKeyName,
  isShortCircuit,
  type LayerDescriptor,
  type ContextKey,
  type Outcome,
  type PipelineItem,
  type TerminalLayerDescriptor,
  type ValidationLayerDescriptor,
} from '@loutrefw/core'

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
}

interface EnteredLayer<TContext extends object> {
  readonly layer: LayerDescriptor
  readonly context: TContext
  readonly state: unknown
}

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
  const entered: EnteredLayer<TContext>[] = []
  const context = hooks.context as TContext & Record<string, unknown>
  const availableKeys = new Set<ContextKey>()

  let outcome: Outcome<TResult>
  try {
    let result!: TResult
    let completed = false
    for (const item of pipeline) {
      if (item.kind === 'validation') {
        await hooks.validate(item, context)
        continue
      }
      if (item.kind === 'terminal') {
        result = await hooks.terminal(item, context)
        completed = true
        continue
      }

      for (const required of item.requires) {
        if (!availableKeys.has(required)) {
          throw new LayerContractError(
            `${item.name}が必要とするContext Key ${contextKeyName(required)}は利用できません`,
          )
        }
      }

      const inboundResult = await item.inbound?.(context)
      if (isShortCircuit(inboundResult)) {
        entered.push({
          layer: item,
          context,
          state: inboundResult.state,
        })
        result = inboundResult.result as TResult
        completed = true
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

    if (!completed) throw new Error('Pipelineがresultを生成しませんでした')
    outcome = { ok: true, value: result }
  } catch (error) {
    outcome = { ok: false, error }
  }

  for (const { layer, context: enteredContext, state } of entered.reverse()) {
    try {
      await layer.outbound?.(enteredContext as any, outcome, state as any)
    } catch (error) {
      outcome = { ok: false, error }
    }
  }

  if (!outcome.ok) throw outcome.error
  return outcome.value as TResult
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
