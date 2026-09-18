import { describe, expect, it } from 'vitest'
import { buildTimeline } from '../lib/devtools-timeline'
import type { RuntimeEvent } from '../lib/devtools-runtime'

const events: RuntimeEvent[] = [
  {
    type: 'execution.started',
    runId: 'run',
    seq: 1,
    timestamp: 1_000,
    traceId: 'trace',
    spanId: 'root',
    executionId: 'UsersController',
    executionKind: 'http.request',
    name: 'POST /users',
  },
  {
    type: 'span.started',
    runId: 'run',
    seq: 2,
    timestamp: 1_010,
    traceId: 'trace',
    spanId: 'repo-a',
    parentSpanId: 'root',
    kind: 'provider.method',
    name: 'Repository.create',
  },
  {
    type: 'span.started',
    runId: 'run',
    seq: 3,
    timestamp: 1_012,
    traceId: 'trace',
    spanId: 'repo-b',
    parentSpanId: 'root',
    kind: 'provider.method',
    name: 'Audit.write',
  },
  {
    type: 'span.ended',
    runId: 'run',
    seq: 4,
    timestamp: 1_025,
    traceId: 'trace',
    spanId: 'repo-a',
    parentSpanId: 'root',
    durationMs: 15,
    status: 'ok',
  },
  {
    type: 'span.ended',
    runId: 'run',
    seq: 5,
    timestamp: 1_030,
    traceId: 'trace',
    spanId: 'repo-b',
    parentSpanId: 'root',
    durationMs: 18,
    status: 'ok',
  },
  {
    type: 'execution.ended',
    runId: 'run',
    seq: 6,
    timestamp: 1_040,
    traceId: 'trace',
    spanId: 'root',
    executionId: 'UsersController',
    durationMs: 40,
    status: 'ok',
  },
]

describe('Devtools trace timeline', () => {
  it('spanをtrace開始からのoffsetとdurationへ変換する', () => {
    const timeline = buildTimeline(events)

    expect(timeline.durationMs).toBe(40)
    expect(timeline.entries).toMatchObject([
      { depth: 0, offsetMs: 0, durationMs: 40, endOffsetMs: 40 },
      { depth: 1, offsetMs: 10, durationMs: 15, endOffsetMs: 25 },
      { depth: 1, offsetMs: 12, durationMs: 18, endOffsetMs: 30 },
    ])
  })
})
