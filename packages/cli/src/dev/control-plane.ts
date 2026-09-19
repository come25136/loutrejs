import type {
  ProviderMethodInvocationRequest,
  ProviderPlaygroundRequest,
  ReplayCapsuleRequest,
  RuntimeEvent,
} from '@loutrejs/loutre/devtools'
import type { ApplicationChannel } from './application-channel.js'
import { DevtoolsEventStore } from './event-store.js'
import { match } from 'ts-pattern'

export interface DevtoolsControlGraphSnapshot {
  readonly schemaVersion: number
  readonly nodes: readonly unknown[]
  readonly edges: readonly unknown[]
  readonly diagnostics: readonly unknown[]
}

export interface DevtoolsControlGraphState {
  readonly revision: number
  readonly snapshot?: DevtoolsControlGraphSnapshot
  readonly error?: string
}

export type DevtoolsControlEvent =
  | {
      readonly type: 'event'
      readonly event: 'graph.state'
      readonly payload: DevtoolsControlGraphState
    }
  | {
      readonly type: 'event'
      readonly event: 'runtime.batch' | 'runtime.snapshot'
      readonly payload: readonly RuntimeEvent[]
    }

export type DevtoolsControlMethod =
  | 'graph.get'
  | 'graph.reload'
  | 'runtime.runs'
  | 'runtime.traces'
  | 'runtime.traces.clear'
  | 'runtime.trace.get'
  | 'runtime.capsule.replay'
  | 'runtime.provider.playground'
  | 'runtime.provider.invoke'

export interface DevtoolsControlRequest {
  readonly method: DevtoolsControlMethod
  readonly params?: unknown
}

export interface DevtoolsControlPlaneOptions {
  readonly graphState: () => DevtoolsControlGraphState
  readonly reload: () => Promise<void>
  readonly eventStore?: DevtoolsEventStore
  readonly command?: ApplicationChannel['command']
}

export class DevtoolsControlPlane {
  readonly #listeners = new Set<(event: DevtoolsControlEvent) => void>()
  readonly #unsubscribeRuntime: (() => void) | undefined

  constructor(readonly options: DevtoolsControlPlaneOptions) {
    this.#unsubscribeRuntime = options.eventStore?.subscribe((events) => {
      this.#emit({ type: 'event', event: 'runtime.batch', payload: events })
    })
  }

  subscribe(listener: (event: DevtoolsControlEvent) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  publishGraphState(): void {
    this.#emit({
      type: 'event',
      event: 'graph.state',
      payload: this.options.graphState(),
    })
  }

  publishRuntimeSnapshot(): void {
    this.#emit({ type: 'event', event: 'runtime.snapshot', payload: [] })
  }

  close(): void {
    this.#unsubscribeRuntime?.()
    this.#listeners.clear()
  }

  async request(request: DevtoolsControlRequest): Promise<unknown> {
    return match(request)
      .with({ method: 'graph.get' }, () => this.options.graphState())
      .with({ method: 'graph.reload' }, async () => {
        await this.options.reload()
        return this.options.graphState()
      })
      .with({ method: 'runtime.runs' }, () => ({
        runs: this.#runtime().eventStore.listRuns(),
      }))
      .with({ method: 'runtime.traces' }, () => ({
        traces: this.#runtime().eventStore.listTraces(),
      }))
      .with({ method: 'runtime.traces.clear' }, () => {
        const runtime = this.#runtime()
        const cleared = runtime.eventStore.clearEvents()
        this.publishRuntimeSnapshot()
        return { cleared }
      })
      .with({ method: 'runtime.trace.get' }, (candidate) => {
        const { traceId } = paramsRecord(candidate.params)
        if (typeof traceId !== 'string' || traceId.length === 0) {
          throw new Error('Trace id is required.')
        }
        const events = this.#runtime().eventStore.traceEvents(traceId)
        if (events.length === 0) throw new Error('Trace not found.')
        return { traceId, events }
      })
      .with({ method: 'runtime.capsule.replay' }, (candidate) =>
        this.#replayCapsule(candidate.params),
      )
      .with({ method: 'runtime.provider.playground' }, (candidate) =>
        this.#providerPlayground(candidate.params),
      )
      .with({ method: 'runtime.provider.invoke' }, (candidate) =>
        this.#invokeProvider(candidate.params),
      )
      .exhaustive()
  }

  #emit(event: DevtoolsControlEvent): void {
    for (const listener of this.#listeners) listener(event)
  }

  #runtime(): {
    readonly eventStore: DevtoolsEventStore
    readonly command: ApplicationChannel['command']
  } {
    if (!this.options.eventStore || !this.options.command) {
      throw new Error('DevTools runtime is not available.')
    }
    return {
      eventStore: this.options.eventStore,
      command: this.options.command,
    }
  }

  #connectedRun(): {
    readonly runId: string
    readonly eventStore: DevtoolsEventStore
    readonly command: ApplicationChannel['command']
  } {
    const runtime = this.#runtime()
    const run = runtime.eventStore.latestConnectedRun()
    if (!run) throw new Error('No application runtime is connected.')
    return { runId: run.runId, ...runtime }
  }

  async #replayCapsule(params: unknown): Promise<unknown> {
    const body = paramsRecord(params)
    const capsuleId = body.capsuleId
    if (typeof capsuleId !== 'string' || capsuleId.length === 0) {
      throw new Error('Capsule id is required.')
    }
    const runtime = this.#runtime()
    const capsule = runtime.eventStore.findCapsule(capsuleId)
    if (!capsule) throw new Error('Capsule not found.')
    const requestId = `request_${crypto.randomUUID()}`
    const commandRequest: ReplayCapsuleRequest = {
      requestId,
      capsuleId,
      ...('inputOverride' in body ? { inputOverride: body.inputOverride } : {}),
      ...(typeof body.parentTraceId === 'string'
        ? { parentTraceId: body.parentTraceId }
        : {}),
    }
    return runtime.command(capsule.runId, {
      type: 'command.replay-capsule',
      request: commandRequest,
    })
  }

  async #providerPlayground(params: unknown): Promise<unknown> {
    const { graphNodeId } = paramsRecord(params)
    if (typeof graphNodeId !== 'string' || graphNodeId.length === 0) {
      throw new Error('Provider graph node id is required.')
    }
    const runtime = this.#connectedRun()
    const request: ProviderPlaygroundRequest = {
      requestId: `request_${crypto.randomUUID()}`,
      graphNodeId,
    }
    return runtime.command(runtime.runId, {
      type: 'command.provider-playground',
      request,
    })
  }

  async #invokeProvider(params: unknown): Promise<unknown> {
    const body = paramsRecord(params)
    if (
      typeof body.graphNodeId !== 'string' ||
      body.graphNodeId.length === 0 ||
      typeof body.method !== 'string' ||
      !Array.isArray(body.args)
    ) {
      throw new Error(
        'Expected { graphNodeId: string, method: string, args: unknown[] }.',
      )
    }
    const runtime = this.#connectedRun()
    const request: ProviderMethodInvocationRequest = {
      requestId: `request_${crypto.randomUUID()}`,
      graphNodeId: body.graphNodeId,
      method: body.method,
      args: body.args,
    }
    return runtime.command(runtime.runId, {
      type: 'command.invoke-provider-method',
      request,
    })
  }
}

function paramsRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
