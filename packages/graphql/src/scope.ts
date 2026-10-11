import { registerExecutor, type DataDefinition } from './data-internal.js'
import type { FieldSelection } from './data-types.js'
import type { BoundManifest } from './manifest-internal.js'
import { normalizeFieldArguments } from './arguments.js'
import { analyzeSelection, selectionKey } from './selection.js'

export interface DataStatistics {
  reused: number
  calls: number
  parents: number
  duration: number
}
export function statistics(): DataStatistics {
  return { reused: 0, calls: 0, parents: 0, duration: 0 }
}
export function statisticsAttributes(stats: DataStatistics) {
  return {
    'graphql.data.field.reused_count': stats.reused,
    'graphql.data.batch.call_count': stats.calls,
    'graphql.data.batch.parent_count': stats.parents,
    'graphql.data.batch.duration_ms': stats.duration,
  }
}
interface Request {
  readonly parent: unknown
  readonly resolve: (result: unknown) => void
  readonly reject: (error: unknown) => void
}
interface Batch {
  readonly requests: Request[]
  readonly dedup: WeakMap<object, Promise<unknown>>
  readonly definition: DataDefinition
  readonly args: unknown
  readonly selection: FieldSelection
}

class Scope {
  readonly #batches = new Map<DataDefinition, Map<string, Batch>>()
  readonly #pending = new Set<Request>()
  readonly #signal: AbortSignal
  readonly #context: object
  readonly #stats: DataStatistics
  #opaque = 0
  constructor(context: object, signal: AbortSignal, stats: DataStatistics) {
    this.#context = context
    this.#signal = signal
    this.#stats = stats
    signal.addEventListener('abort', this.abort, { once: true })
  }
  abort = () => {
    for (const request of this.#pending)
      request.reject(
        this.#signal.reason ?? new Error('GraphQL Operationを中断しました。'),
      )
    this.#pending.clear()
    this.#batches.clear()
  }
  close() {
    this.#signal.removeEventListener('abort', this.abort)
    this.#batches.clear()
  }
  load(
    definition: DataDefinition,
    parent: unknown,
    args: unknown,
    selection: FieldSelection,
    argumentsKey: string | undefined,
    selectionIdentity: string | undefined,
  ) {
    this.#signal.throwIfAborted()
    const key =
      argumentsKey === undefined || selectionIdentity === undefined
        ? `opaque:${this.#opaque++}`
        : `${argumentsKey}:${selectionIdentity}`
    let groups = this.#batches.get(definition)
    if (!groups) {
      groups = new Map()
      this.#batches.set(definition, groups)
    }
    let batch = groups.get(key)
    if (!batch) {
      batch = {
        requests: [],
        dedup: new WeakMap(),
        definition,
        args,
        selection,
      }
      groups.set(key, batch)
    }
    if (typeof parent === 'object' && parent !== null) {
      const pending = batch.dedup.get(parent)
      if (pending) return pending
    }
    const target = batch
    const promise = new Promise<unknown>((resolve, reject) => {
      const request = { parent, resolve, reject }
      this.#pending.add(request)
      if (!target.requests.length)
        queueMicrotask(() => {
          void this.flush(target)
        })
      target.requests.push(request)
    })
    if (typeof parent === 'object' && parent !== null) {
      target.dedup.set(parent, promise)
      const remove = () => target.dedup.delete(parent)
      void promise.then(remove, remove)
    }
    return promise
  }
  async flush(batch: Batch) {
    const requests = batch.requests.splice(0)
    const limit = batch.definition.options.maxBatchSize ?? requests.length
    for (let index = 0; index < requests.length; index += limit) {
      const chunk = requests.slice(index, index + limit)
      if (this.#signal.aborted) {
        for (const request of chunk) {
          request.reject(this.#signal.reason)
          this.#pending.delete(request)
        }
        continue
      }
      const start = performance.now()
      this.#stats.calls++
      this.#stats.parents += chunk.length
      try {
        const values = await batch.definition.options.load({
          parents: chunk.map((request) => request.parent),
          args: batch.args,
          context: this.#context,
          signal: this.#signal,
          selection: batch.selection,
        })
        if (!Array.isArray(values) || values.length !== chunk.length)
          throw new TypeError(
            `${batch.definition.identity}.loadはParentと同じ要素数の配列を返してください。`,
          )
        this.#signal.throwIfAborted()
        chunk.forEach((request, position) =>
          values[position] instanceof Error
            ? request.reject(values[position])
            : request.resolve(values[position]),
        )
      } catch (error) {
        for (const request of chunk) request.reject(error)
      } finally {
        this.#stats.duration += performance.now() - start
        for (const request of chunk) this.#pending.delete(request)
      }
    }
  }
}

export function executionView(
  bound: BoundManifest,
  context: unknown,
  signal: AbortSignal,
  stats: DataStatistics,
) {
  if (!context || typeof context !== 'object')
    throw new TypeError('GraphQL contextはobjectを返してください。')
  const methods = new WeakMap<Function, Function>()
  const view = new Proxy(
    Object.create(Object.getPrototypeOf(context)) as object,
    {
      get(_target, key) {
        const value = Reflect.get(context, key, context)
        if (typeof value !== 'function') return value
        let method = methods.get(value)
        if (!method) {
          method = value.bind(context)
          methods.set(value, method!)
        }
        return method
      },
      set(_target, key, value) {
        return Reflect.set(context, key, value, context)
      },
      has(_target, key) {
        return key in context
      },
      ownKeys() {
        return Reflect.ownKeys(context)
      },
      getOwnPropertyDescriptor(_target, key) {
        const descriptor = Object.getOwnPropertyDescriptor(context, key)
        return descriptor ? { ...descriptor, configurable: true } : undefined
      },
    },
  )
  const controller = new AbortController()
  const scopedSignal = AbortSignal.any([signal, controller.signal])
  const scopes = new Map<string, Scope>()
  registerExecutor(
    view,
    async (definition, parent, args, activeContext, info) => {
      if (
        bound.metadata.get(`${info.parentType.name}.${info.fieldName}`) !==
        definition
      )
        throw new TypeError(
          'Batch設定がBinding後に欠落または置換されています。',
        )
      scopedSignal.throwIfAborted()
      const selection = analyzeSelection(info, bound.metadata)
      if (definition.options.authorize)
        await definition.options.authorize({
          parent,
          args,
          context: activeContext,
          info,
        })
      scopedSignal.throwIfAborted()
      let read
      if (definition.options.read)
        read = definition.options.read({
          parent,
          args,
          context: activeContext,
          info,
        })
      else if (
        !info.parentType.getFields()[info.fieldName]!.args.length &&
        parent !== null &&
        (typeof parent === 'object' || typeof parent === 'function')
      ) {
        const descriptor = Object.getOwnPropertyDescriptor(
          parent,
          info.fieldName,
        )
        if (
          descriptor &&
          'value' in descriptor &&
          descriptor.value !== undefined
        )
          read = { kind: 'loaded', value: descriptor.value }
      }
      if (read) {
        if (read.kind === 'loaded') {
          if (read.value === undefined)
            throw new TypeError(
              `${definition.identity}.readはloaded(undefined)を返せません。`,
            )
          stats.reused++
          return read.value
        }
        if (read.kind !== 'missing')
          throw new TypeError(`${definition.identity}.readが不正です。`)
      }
      for (const key of definition.options.requires ?? []) {
        if (
          !parent ||
          (typeof parent !== 'object' && typeof parent !== 'function') ||
          !(key in parent) ||
          (parent as Record<string, unknown>)[key] === undefined
        )
          throw new TypeError(
            `${definition.identity}に必要な内部キー${key}がありません。`,
          )
      }
      let path = info.path
      while (path.prev) path = path.prev
      const scopeKey =
        info.operation.operation === 'mutation' ? String(path.key) : 'operation'
      let scope = scopes.get(scopeKey)
      if (!scope) {
        scope = new Scope(view, scopedSignal, stats)
        scopes.set(scopeKey, scope)
      }
      return scope.load(
        definition,
        parent,
        args,
        selection,
        normalizeFieldArguments(
          args as Record<string, unknown>,
          info.parentType.getFields()[info.fieldName]!.args,
        ),
        selectionKey(selection, info.schema),
      )
    },
  )
  return {
    context: view,
    close() {
      controller.abort()
      for (const scope of scopes.values()) scope.close()
      scopes.clear()
    },
  }
}
