import type {
  RuntimeExecutionMetadata,
  RuntimeInstrumentation,
  RuntimeInstrumentationScope,
  RuntimeInvocationRegistration,
  RuntimeProviderMetadata,
  RuntimeOperationMetadata,
} from '../core/instrumentation.js'
import { ReplayCapsuleStore } from './capsule.js'
import type {
  ProviderMethodInvocationRequest,
  ProviderPlaygroundDescriptor,
  ProviderPlaygroundRequest,
  ReplayCapsuleRequest,
  ReplayExecutionContext,
  RuntimeDevtoolsContext,
  RuntimeDevtoolsContextStorage,
  RuntimeInspector,
  RuntimeInvocationResult,
} from './inspector.js'
import type { DevtoolsModuleOptions } from './module.js'
import {
  serializeDevtoolsError,
  type RuntimeObserver,
  type RuntimeSpanKind,
} from './observer.js'
import {
  discoverProviderMethods,
  instrumentProviderMethods,
  type ProviderMethodDefinition,
  type ProviderMethodInvocation,
} from './provider-instrumentation.js'
import { previewDevtoolsValue } from './values.js'

interface RegisteredProvider {
  readonly metadata: RuntimeProviderMetadata
  readonly instance: object
  readonly methods: ReadonlyMap<string, ProviderMethodDefinition>
}

export interface RuntimeDevtoolsInstrumentationOptions {
  readonly options: Readonly<DevtoolsModuleOptions>
  readonly observer: RuntimeObserver
  readonly context: RuntimeDevtoolsContextStorage
}

export class RuntimeDevtoolsInstrumentation
  implements RuntimeInstrumentation, RuntimeInspector
{
  readonly #options: Readonly<DevtoolsModuleOptions>
  readonly #observer: RuntimeObserver
  readonly #context: RuntimeDevtoolsContextStorage
  readonly #captureProviderMethods: boolean
  readonly #captureResults: boolean
  readonly #runId: string
  readonly #capsules: ReplayCapsuleStore | undefined
  readonly #providers = new Map<string, RegisteredProvider>()
  readonly #providerMethods = new WeakMap<
    object,
    readonly ProviderMethodDefinition[]
  >()
  readonly #instrumentedProviderIds = new WeakMap<object, string>()
  readonly #externalProviderValues = new WeakSet<object>()
  readonly #ambiguousProviders = new WeakSet<object>()
  readonly #providerRestorers = new WeakMap<object, () => void>()
  readonly #applicationProviderRestorers = new Map<object, () => void>()
  #seq = 0

  constructor(options: RuntimeDevtoolsInstrumentationOptions) {
    this.#options = options.options
    this.#observer = options.observer
    this.#context = options.context
    this.#captureProviderMethods =
      options.options.capture?.providerMethods !== false
    const captureResults = options.options.capture?.results
    this.#captureResults =
      captureResults !== false && captureResults !== 'errors'
    this.#runId = options.observer.runId ?? `run_${crypto.randomUUID()}`
    const replay = options.options.replay
    this.#capsules =
      replay?.enabled === false
        ? undefined
        : new ReplayCapsuleStore(this.#runId, {
            ...(replay?.capsuleTtlMs === undefined
              ? {}
              : { ttlMs: replay.capsuleTtlMs }),
            ...(replay?.maxCapsules === undefined
              ? {}
              : { maxCapsules: replay.maxCapsules }),
            ...(options.options.capture === undefined
              ? {}
              : { capture: options.options.capture }),
            ...(options.options.redact === undefined
              ? {}
              : { redact: options.options.redact }),
          })
  }

  beginExecution(
    metadata: RuntimeExecutionMetadata,
    invocation?: RuntimeInvocationRegistration,
  ): RuntimeInstrumentationScope {
    const traceId = `trace_${crypto.randomUUID()}`
    const spanId = `span_${crypto.randomUUID()}`
    const startedAt = performance.now()
    const startedTimestamp = performance.timeOrigin + startedAt
    const name = metadata.name ?? metadata.executionId
    const replaySource = this.#context.current()?.replay
    const capsule =
      invocation && this.#capsules
        ? this.#capsules.createExecution(traceId, spanId, metadata, {
            input: invocation.input,
            replay: (input, context) =>
              this.#runReplayContext(context, () => invocation.invoke(input)),
          })
        : undefined
    let completed = false
    let failed = false
    let failureReason: unknown
    let cancelled = false
    const attributes: Record<string, unknown> = {}

    this.#notify('executionStarted', {
      type: 'execution.started',
      ...this.#identity(
        startedTimestamp,
        traceId,
        spanId,
        metadata.graphNodeId,
      ),
      executionId: metadata.executionId,
      executionKind: metadata.executionKind,
      name,
      ...(capsule === undefined
        ? {}
        : {
            input: capsule.input,
            capsuleId: capsule.id,
            replayable: true,
            replayModes: capsule.replayModes,
          }),
      ...(replaySource === undefined
        ? {}
        : {
            replayedFromTraceId: replaySource.sourceTraceId,
            replayedFromCapsuleId: replaySource.sourceCapsuleId,
          }),
    })
    this.#notify('spanStarted', {
      type: 'span.started',
      ...this.#identity(
        startedTimestamp,
        traceId,
        spanId,
        metadata.graphNodeId,
      ),
      kind: 'execution',
      name,
      attributes: { executionKind: metadata.executionKind },
    })

    return {
      run: <T>(operation: () => T): T =>
        this.#context.run(
          {
            trace: { traceId, spanId },
            ...(replaySource === undefined ? {} : { replay: replaySource }),
          },
          operation,
        ),
      abort() {
        cancelled = true
      },
      fail(reason: unknown) {
        failed = true
        failureReason = reason
      },
      annotate(nextAttributes: Readonly<Record<string, unknown>>) {
        Object.assign(attributes, nextAttributes)
      },
      complete: (...resultValues: [] | [unknown]) => {
        if (completed) return
        completed = true
        const status = failed ? 'error' : cancelled ? 'cancelled' : 'ok'
        const error = failed ? serializeDevtoolsError(failureReason) : undefined
        const result =
          resultValues.length === 0
            ? undefined
            : this.#previewResult(resultValues[0])
        const endedAt = performance.now()
        const timestamp = performance.timeOrigin + endedAt
        this.#notify('spanEnded', {
          type: 'span.ended',
          ...this.#identity(timestamp, traceId, spanId, metadata.graphNodeId),
          durationMs: endedAt - startedAt,
          status,
          ...(Object.keys(attributes).length === 0 ? {} : { attributes }),
          ...(result === undefined ? {} : { result }),
          ...(error === undefined ? {} : { error }),
        })
        this.#notify('executionEnded', {
          type: 'execution.ended',
          ...this.#identity(timestamp, traceId, spanId, metadata.graphNodeId),
          executionId: metadata.executionId,
          durationMs: endedAt - startedAt,
          status,
          ...(Object.keys(attributes).length === 0 ? {} : { attributes }),
          ...(result === undefined ? {} : { result }),
          ...(error === undefined ? {} : { error }),
        })
      },
    }
  }

  beginOperation(
    metadata: RuntimeOperationMetadata,
    invocation?: RuntimeInvocationRegistration,
  ): RuntimeInstrumentationScope | undefined {
    const current = this.#context.current()
    if (!current?.trace) return undefined

    const spanId = `span_${crypto.randomUUID()}`
    const startedAt = performance.now()
    const capsule =
      invocation && this.#capsules
        ? this.#capsules.createExecution(
            current.trace.traceId,
            spanId,
            {
              executionId: `span:${metadata.name}`,
              executionKind: metadata.kind,
              name: metadata.name,
              ...(metadata.graphNodeId === undefined
                ? {}
                : { graphNodeId: metadata.graphNodeId }),
            },
            {
              input: invocation.input,
              replay: (input, context) =>
                this.#runReplayContext(context, () => invocation.invoke(input)),
            },
          )
        : undefined
    let completed = false
    let failed = false
    let failureReason: unknown
    const attributes: Record<string, unknown> = {}

    this.#notify('spanStarted', {
      type: 'span.started',
      runId: this.#runId,
      seq: ++this.#seq,
      timestamp: performance.timeOrigin + startedAt,
      traceId: current.trace.traceId,
      spanId,
      parentSpanId: current.trace.spanId,
      ...(metadata.graphNodeId === undefined
        ? {}
        : { graphNodeId: metadata.graphNodeId }),
      kind: metadata.kind as RuntimeSpanKind,
      name: metadata.name,
      ...(capsule === undefined
        ? {}
        : {
            input: capsule.input,
            capsuleId: capsule.id,
            replayable: true,
            replayModes: capsule.replayModes,
          }),
    })

    return {
      run: <T>(operation: () => T): T =>
        this.#context.run(
          {
            trace: { traceId: current.trace!.traceId, spanId },
            ...(current.replay === undefined ? {} : { replay: current.replay }),
          },
          operation,
        ),
      fail(reason: unknown) {
        failed = true
        failureReason = reason
      },
      annotate(nextAttributes: Readonly<Record<string, unknown>>) {
        Object.assign(attributes, nextAttributes)
      },
      complete: (...resultValues: [] | [unknown]) => {
        if (completed) return
        completed = true
        const result =
          resultValues.length === 0
            ? undefined
            : this.#previewResult(resultValues[0])
        const error = failed ? serializeDevtoolsError(failureReason) : undefined
        const endedAt = performance.now()
        this.#notify('spanEnded', {
          type: 'span.ended',
          runId: this.#runId,
          seq: ++this.#seq,
          timestamp: performance.timeOrigin + endedAt,
          traceId: current.trace!.traceId,
          spanId,
          parentSpanId: current.trace!.spanId,
          ...(metadata.graphNodeId === undefined
            ? {}
            : { graphNodeId: metadata.graphNodeId }),
          durationMs: endedAt - startedAt,
          status: failed ? 'error' : 'ok',
          ...(Object.keys(attributes).length === 0 ? {} : { attributes }),
          ...(result === undefined ? {} : { result }),
          ...(error === undefined ? {} : { error }),
        })
      },
    }
  }

  providerCreated(metadata: RuntimeProviderMetadata, value: unknown): void {
    if (typeof value !== 'object' || value === null) return
    let methods = this.#providerMethods.get(value)
    if (!methods) {
      methods = discoverProviderMethods(value)
      this.#providerMethods.set(value, methods)
    }
    if (metadata.scope === 'application') {
      this.#providers.set(metadata.graphNodeId, {
        metadata,
        instance: value,
        methods: new Map(
          methods.flatMap((method) =>
            typeof method.key === 'string' ? [[method.name, method]] : [],
          ),
        ),
      })
    }
    if (!this.#captureProviderMethods) return
    if (
      metadata.providerKind === 'value' ||
      metadata.providerKind === 'factory'
    ) {
      this.#providerRestorers.get(value)?.()
      this.#providerRestorers.delete(value)
      this.#applicationProviderRestorers.delete(value)
      this.#externalProviderValues.add(value)
      return
    }
    if (
      this.#externalProviderValues.has(value) ||
      this.#ambiguousProviders.has(value)
    ) {
      return
    }
    const instrumentedProviderId = this.#instrumentedProviderIds.get(value)
    if (instrumentedProviderId !== undefined) {
      if (instrumentedProviderId !== metadata.graphNodeId) {
        this.#providerRestorers.get(value)?.()
        this.#providerRestorers.delete(value)
        this.#applicationProviderRestorers.delete(value)
        this.#ambiguousProviders.add(value)
      }
      return
    }
    const restore = instrumentProviderMethods(value, (invocation) =>
      this.#invokeProviderMethod(metadata, value, invocation),
    )
    this.#instrumentedProviderIds.set(value, metadata.graphNodeId)
    this.#providerRestorers.set(value, restore)
    if (metadata.scope === 'application') {
      this.#applicationProviderRestorers.set(value, restore)
    }
  }

  async providerPlayground(
    request: ProviderPlaygroundRequest,
  ): Promise<ProviderPlaygroundDescriptor> {
    const provider = this.#providers.get(request.graphNodeId)
    if (!provider) {
      throw new Error(
        `LUTRE_DEVTOOLS_PROVIDER_UNAVAILABLE: ${request.graphNodeId}`,
      )
    }
    return {
      requestId: request.requestId,
      graphNodeId: request.graphNodeId,
      providerName: provider.metadata.name,
      methods: [...provider.methods.values()]
        .map((method) => ({ name: method.name, arity: method.original.length }))
        .toSorted((left, right) => left.name.localeCompare(right.name)),
    }
  }

  async invokeProviderMethod(
    request: ProviderMethodInvocationRequest,
  ): Promise<RuntimeInvocationResult> {
    const provider = this.#providers.get(request.graphNodeId)
    if (!provider) {
      return {
        requestId: request.requestId,
        status: 'error',
        error: {
          name: 'ProviderUnavailableError',
          message: `LUTRE_DEVTOOLS_PROVIDER_UNAVAILABLE: ${request.graphNodeId}`,
        },
      }
    }
    const method = provider.methods.get(request.method)
    if (!method) {
      return {
        requestId: request.requestId,
        status: 'error',
        error: {
          name: 'ProviderMethodUnavailableError',
          message: `LUTRE_DEVTOOLS_PROVIDER_METHOD_UNAVAILABLE: ${request.method}`,
        },
      }
    }

    let traceId: string | undefined
    try {
      const result = await this.#runProviderMethodExecution(
        provider.metadata,
        provider.instance,
        method.original,
        method.name,
        request.args,
        (nextTraceId) => {
          traceId = nextTraceId
        },
      )
      return {
        requestId: request.requestId,
        status: 'ok',
        ...(traceId === undefined ? {} : { traceId }),
        result: this.#previewValue(result),
      }
    } catch (error) {
      return {
        requestId: request.requestId,
        status: 'error',
        ...(traceId === undefined ? {} : { traceId }),
        error: serializeDevtoolsError(error),
      }
    }
  }

  async replayCapsule(
    request: ReplayCapsuleRequest,
  ): Promise<RuntimeInvocationResult> {
    if (!this.#capsules) {
      return {
        requestId: request.requestId,
        status: 'error',
        error: {
          name: 'ReplayDisabledError',
          message: 'LUTRE_DEVTOOLS_REPLAY_DISABLED: Replay is not enabled.',
        },
      }
    }
    return this.#capsules.replay(request)
  }

  close(): void {
    this.#capsules?.clear()
    this.#providers.clear()
    for (const restore of this.#applicationProviderRestorers.values()) restore()
    this.#applicationProviderRestorers.clear()
  }

  #invokeProviderMethod(
    metadata: RuntimeProviderMetadata,
    instance: object,
    invocation: ProviderMethodInvocation,
  ): unknown {
    const current = this.#context.current()
    if (!current?.trace) {
      return Reflect.apply(
        invocation.original,
        invocation.receiver,
        invocation.args,
      )
    }

    const spanId = `span_${crypto.randomUUID()}`
    const startedAt = performance.now()
    const name = `${metadata.name}.${invocation.name}`
    const capsule =
      metadata.scope === 'transient'
        ? undefined
        : this.#capsules?.createExecution(
            current.trace.traceId,
            spanId,
            {
              executionId: `${metadata.providerId}.${invocation.name}`,
              executionKind: 'provider.method',
              graphNodeId: metadata.graphNodeId,
              name,
            },
            {
              input: invocation.args,
              replay: (input, context) =>
                this.#runReplayContext(context, () =>
                  this.#replayProviderMethod(
                    metadata,
                    instance,
                    invocation.original,
                    invocation.name,
                    input,
                  ),
                ),
            },
          )

    let result: unknown
    try {
      result = Reflect.apply(
        invocation.original,
        invocation.receiver,
        invocation.args,
      )
    } catch (error) {
      this.#recordProviderMethodSpan(
        metadata,
        invocation,
        current.trace,
        spanId,
        startedAt,
        capsule,
        { status: 'error', error },
      )
      throw error
    }

    // Observing Promise settlement would attach a rejection handler and can
    // change Application-level unhandled-rejection semantics. Preserve the
    // original Promise identity and only auto-trace provider calls whose full
    // lifetime is synchronously observable. Playground/Replay are explicit
    // invocations and still await Promise-returning methods.
    if (result instanceof Promise) {
      if (capsule) this.#capsules?.discard(capsule.id)
      return result
    }

    this.#recordProviderMethodSpan(
      metadata,
      invocation,
      current.trace,
      spanId,
      startedAt,
      capsule,
      { status: 'ok', result },
    )
    return result
  }

  #recordProviderMethodSpan(
    metadata: RuntimeProviderMetadata,
    invocation: ProviderMethodInvocation,
    parent: { readonly traceId: string; readonly spanId: string },
    spanId: string,
    startedAt: number,
    capsule: ReturnType<ReplayCapsuleStore['createExecution']> | undefined,
    outcome:
      | { readonly status: 'ok'; readonly result: unknown }
      | { readonly status: 'error'; readonly error: unknown },
  ): void {
    const name = `${metadata.name}.${invocation.name}`
    this.#notify('spanStarted', {
      type: 'span.started',
      runId: this.#runId,
      seq: ++this.#seq,
      timestamp: performance.timeOrigin + startedAt,
      traceId: parent.traceId,
      spanId,
      parentSpanId: parent.spanId,
      graphNodeId: metadata.graphNodeId,
      kind: 'provider.method',
      name,
      ...(capsule === undefined
        ? {}
        : {
            input: capsule.input,
            capsuleId: capsule.id,
            replayable: true,
            replayModes: capsule.replayModes,
          }),
    })

    const endedAt = performance.now()
    const result =
      outcome.status === 'ok' ? this.#previewResult(outcome.result) : undefined
    this.#notify('spanEnded', {
      type: 'span.ended',
      runId: this.#runId,
      seq: ++this.#seq,
      timestamp: performance.timeOrigin + endedAt,
      traceId: parent.traceId,
      spanId,
      parentSpanId: parent.spanId,
      graphNodeId: metadata.graphNodeId,
      durationMs: endedAt - startedAt,
      status: outcome.status,
      ...(result === undefined ? {} : { result }),
      ...(outcome.status === 'error'
        ? { error: serializeDevtoolsError(outcome.error) }
        : {}),
    })
  }

  async #replayProviderMethod(
    metadata: RuntimeProviderMetadata,
    instance: object,
    original: Function,
    method: string,
    input: unknown,
  ): Promise<unknown> {
    return this.#runProviderMethodExecution(
      metadata,
      instance,
      original,
      method,
      input,
    )
  }

  async #runProviderMethodExecution(
    metadata: RuntimeProviderMetadata,
    instance: object,
    original: Function,
    method: string,
    input: unknown,
    onTraceId?: (traceId: string) => void,
  ): Promise<unknown> {
    if (!Array.isArray(input)) {
      throw new TypeError('LUTRE_DEVTOOLS_PROVIDER_ARGS_REQUIRED')
    }
    const scope = this.beginExecution(
      {
        executionId: `${metadata.providerId}.${method}`,
        executionKind: 'provider.method',
        graphNodeId: metadata.graphNodeId,
        name: `${metadata.name}.${method}`,
      },
      {
        input,
        invoke: (nextInput) =>
          this.#runProviderMethodExecution(
            metadata,
            instance,
            original,
            method,
            nextInput,
          ),
      },
    )
    let result: unknown
    let hasResult = false
    try {
      const invoke = () => {
        const traceId = this.#context.current()?.trace?.traceId
        if (traceId) onTraceId?.(traceId)
        return Reflect.apply(original, instance, input)
      }
      result = await (scope.run ? scope.run(invoke) : invoke())
      hasResult = true
      return result
    } catch (error) {
      scope.fail?.(error)
      throw error
    } finally {
      if (hasResult) scope.complete(result)
      else scope.complete()
    }
  }

  #runReplayContext<T>(context: ReplayExecutionContext, operation: () => T): T {
    const current = this.#context.current()
    const next: RuntimeDevtoolsContext = {
      ...(current?.trace === undefined ? {} : { trace: current.trace }),
      replay: context,
    }
    return this.#context.run(next, operation)
  }

  #previewResult(value: unknown) {
    if (!this.#captureResults) return undefined
    return this.#previewValue(value)
  }

  #previewValue(value: unknown) {
    const capture = this.#options.capture
    return previewDevtoolsValue(value, {
      ...(capture?.maxValueBytes === undefined
        ? {}
        : { maxValueBytes: capture.maxValueBytes }),
      ...(capture?.maxDepth === undefined
        ? {}
        : { maxDepth: capture.maxDepth }),
      ...(this.#options.redact === undefined
        ? {}
        : { redact: this.#options.redact }),
    })
  }

  #identity(
    timestamp: number,
    traceId: string,
    spanId: string,
    graphNodeId?: string,
  ) {
    return {
      runId: this.#runId,
      seq: ++this.#seq,
      timestamp,
      traceId,
      spanId,
      ...(graphNodeId === undefined ? {} : { graphNodeId }),
    }
  }

  #notify<
    TKey extends
      | 'executionStarted'
      | 'executionEnded'
      | 'spanStarted'
      | 'spanEnded',
  >(key: TKey, event: Parameters<NonNullable<RuntimeObserver[TKey]>>[0]): void {
    try {
      const callback = this.#observer[key] as
        | ((value: typeof event) => void)
        | undefined
      callback?.(event)
    } catch {
      // Runtime observation is best-effort and must never affect application behavior.
    }
  }
}
