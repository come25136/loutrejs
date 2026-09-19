import type { RuntimeEvent } from './devtools-runtime'

export type TimelineStartEvent = Extract<
  RuntimeEvent,
  { type: 'execution.started' | 'span.started' }
>
export type TimelineEndEvent = Extract<
  RuntimeEvent,
  { type: 'execution.ended' | 'span.ended' }
>

export interface TimelineEntry {
  readonly start: TimelineStartEvent
  readonly end?: TimelineEndEvent
  readonly depth: number
  readonly offsetMs: number
  readonly durationMs?: number
  readonly endOffsetMs: number
}

export interface TimelineLayout {
  readonly entries: readonly TimelineEntry[]
  readonly durationMs: number
}

export function buildTimeline(events: readonly RuntimeEvent[]): TimelineLayout {
  const ends = new Map(
    events
      .filter(
        (event): event is TimelineEndEvent =>
          event.type === 'execution.ended' || event.type === 'span.ended',
      )
      .map((event) => [event.spanId, event]),
  )
  const starts = timelineStartEvents(events)
  if (starts.length === 0) return { entries: [], durationMs: 0 }

  const origin = Math.min(...starts.map((event) => event.timestamp))
  const latestTimestamp = Math.max(
    ...events.map((event) => event.timestamp),
    origin,
  )
  const parents = new Map(
    starts.map((event) => [event.spanId, event.parentSpanId]),
  )
  const entries = starts.map((start) => {
    const end = ends.get(start.spanId)
    const offsetMs = Math.max(0, start.timestamp - origin)
    const durationMs = end?.durationMs
    const observedDuration = Math.max(0, latestTimestamp - start.timestamp)
    return {
      start,
      end,
      depth: spanDepth(start.spanId, parents),
      offsetMs,
      durationMs,
      endOffsetMs: offsetMs + (durationMs ?? observedDuration),
    }
  })
  const durationMs = Math.max(
    0.01,
    ...entries.map((entry) => entry.endOffsetMs),
    latestTimestamp - origin,
  )
  return { entries, durationMs }
}

export function timelineStartEvents(
  events: readonly RuntimeEvent[],
): TimelineStartEvent[] {
  return events
    .filter(
      (event): event is TimelineStartEvent =>
        event.type === 'execution.started' ||
        (event.type === 'span.started' && event.kind !== 'execution'),
    )
    .toSorted((left, right) => left.seq - right.seq)
}

function spanDepth(
  spanId: string,
  parents: ReadonlyMap<string, string | undefined>,
): number {
  let depth = 0
  let current = parents.get(spanId)
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    seen.add(current)
    depth += 1
    current = parents.get(current)
  }
  return depth
}
