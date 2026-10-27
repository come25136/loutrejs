type EventLimit = number & { readonly '~loutre.cli-quantity': 'event-limit' }
import {
  epochNow,
  type EpochMs,
  type DurationMs,
  type ModelNodeId,
  type RuntimeExecutionId,
} from '@loutrejs/loutre'
import type { RunId, TraceId, CapsuleId } from '@loutrejs/loutre/devtools'
import type {
  DevtoolsValuePreview,
  RuntimeEvent,
} from '@loutrejs/loutre/devtools'

export interface DevtoolsApplicationInfo {
  readonly name?: string
  readonly runtime?: string
  readonly pid?: number
}

export interface DevtoolsRun {
  readonly runId: RunId
  readonly application: DevtoolsApplicationInfo
  readonly connectedAt: EpochMs
  readonly stoppedAt?: EpochMs
}

export interface DevtoolsTraceSummary {
  readonly traceId: TraceId
  readonly runId: RunId
  readonly executionId: RuntimeExecutionId
  readonly executionKind: string
  readonly name: string
  readonly graphNodeId?: ModelNodeId
  readonly startedAt: EpochMs
  readonly durationMs?: DurationMs
  readonly status: 'running' | 'ok' | 'error' | 'cancelled'
  readonly attributes?: Readonly<Record<string, unknown>>
  readonly input?: DevtoolsValuePreview
  readonly capsuleId?: CapsuleId
  readonly replayable?: boolean
  readonly replayModes?: readonly ('direct' | 'transport')[]
  readonly replayedFromTraceId?: TraceId
  readonly replayedFromCapsuleId?: CapsuleId
}

export interface DevtoolsCapsuleSummary {
  readonly capsuleId: CapsuleId
  readonly runId: RunId
  readonly traceId: TraceId
  readonly kind: 'execution' | 'provider-method' | 'span'
  readonly name: string
  readonly graphNodeId?: ModelNodeId
  readonly executionId?: RuntimeExecutionId
  readonly executionKind?: string
  readonly input?: DevtoolsValuePreview
  readonly replayModes: readonly ('direct' | 'transport')[]
}

export class DevtoolsEventStore {
  readonly #maxEvents: EventLimit
  readonly #runs = new Map<RunId, DevtoolsRun>()
  readonly #events: RuntimeEvent[] = []
  readonly #listeners = new Set<(events: readonly RuntimeEvent[]) => void>()

  constructor(maxEvents = 10_000) {
    if (!Number.isInteger(maxEvents) || maxEvents < 1) {
      throw new TypeError('maxEvents must be a positive integer.')
    }
    this.#maxEvents = maxEvents as EventLimit
  }

  connectRun(runId: RunId, application: DevtoolsApplicationInfo): void {
    this.#runs.set(runId, { runId, application, connectedAt: epochNow() })
  }

  stopRun(runId: RunId): void {
    const run = this.#runs.get(runId)
    if (!run || run.stoppedAt !== undefined) return
    this.#runs.set(runId, { ...run, stoppedAt: epochNow() })
  }

  append(runId: RunId, events: readonly RuntimeEvent[]): void {
    const accepted = events.filter((event) => event.runId === runId)
    if (accepted.length === 0) return
    this.#events.push(...accepted)
    if (this.#events.length > this.#maxEvents) {
      this.#events.splice(0, this.#events.length - this.#maxEvents)
    }
    for (const listener of this.#listeners) listener(accepted)
  }

  subscribe(listener: (events: readonly RuntimeEvent[]) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  listRuns(): readonly DevtoolsRun[] {
    return [...this.#runs.values()].toSorted(
      (left, right) => right.connectedAt - left.connectedAt,
    )
  }

  latestConnectedRun(): DevtoolsRun | undefined {
    return this.listRuns().find((run) => run.stoppedAt === undefined)
  }

  listEvents(): readonly RuntimeEvent[] {
    return [...this.#events]
  }

  clearEvents(): number {
    const cleared = this.#events.length
    this.#events.length = 0
    return cleared
  }

  traceEvents(traceId: TraceId): readonly RuntimeEvent[] {
    return this.#events.filter((event) => event.traceId === traceId)
  }

  findCapsule(capsuleId: CapsuleId): DevtoolsCapsuleSummary | undefined {
    for (let index = this.#events.length - 1; index >= 0; index -= 1) {
      const event = this.#events[index]
      if (!event || !('capsuleId' in event) || event.capsuleId !== capsuleId) {
        continue
      }
      if (event.type === 'execution.started') {
        return {
          capsuleId,
          runId: event.runId,
          traceId: event.traceId,
          kind: 'execution',
          name: event.name,
          ...(event.graphNodeId === undefined
            ? {}
            : { graphNodeId: event.graphNodeId }),
          executionId: event.executionId,
          executionKind: event.executionKind,
          ...(event.input === undefined ? {} : { input: event.input }),
          replayModes: event.replayModes ?? ['direct'],
        }
      }
      if (event.type === 'span.started') {
        return {
          capsuleId,
          runId: event.runId,
          traceId: event.traceId,
          kind: event.kind === 'provider.method' ? 'provider-method' : 'span',
          name: event.name,
          ...(event.graphNodeId === undefined
            ? {}
            : { graphNodeId: event.graphNodeId }),
          ...(event.input === undefined ? {} : { input: event.input }),
          replayModes: event.replayModes ?? ['direct'],
        }
      }
    }
    return undefined
  }

  listTraces(): readonly DevtoolsTraceSummary[] {
    const traces = new Map<TraceId, DevtoolsTraceSummary>()
    for (const event of this.#events) {
      if (event.type === 'execution.started') {
        traces.set(event.traceId, {
          traceId: event.traceId,
          runId: event.runId,
          executionId: event.executionId,
          executionKind: event.executionKind,
          name: event.name,
          ...(event.graphNodeId === undefined
            ? {}
            : { graphNodeId: event.graphNodeId }),
          startedAt: event.timestamp,
          status: 'running',
          ...(event.input === undefined ? {} : { input: event.input }),
          ...(event.capsuleId === undefined
            ? {}
            : { capsuleId: event.capsuleId }),
          ...(event.replayable === undefined
            ? {}
            : { replayable: event.replayable }),
          ...(event.replayModes === undefined
            ? {}
            : { replayModes: event.replayModes }),
          ...(event.replayedFromTraceId === undefined
            ? {}
            : { replayedFromTraceId: event.replayedFromTraceId }),
          ...(event.replayedFromCapsuleId === undefined
            ? {}
            : { replayedFromCapsuleId: event.replayedFromCapsuleId }),
        })
      } else if (event.type === 'execution.ended') {
        const current = traces.get(event.traceId)
        if (!current) continue
        traces.set(event.traceId, {
          ...current,
          durationMs: event.durationMs,
          status: event.status,
          ...(event.attributes === undefined
            ? {}
            : { attributes: event.attributes }),
        })
      }
    }
    return [...traces.values()].toSorted(
      (left, right) => right.startedAt - left.startedAt,
    )
  }
}
