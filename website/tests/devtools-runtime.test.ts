import { describe, expect, it } from 'vitest'
import { buildTimeline } from '../lib/devtools-timeline.js'
import type { RuntimeEvent } from '../lib/devtools-runtime.js'

describe('DevTools runtime data', () => {
  it('structured runtime eventsからtimelineを構築する', () => {
    const events: RuntimeEvent[] = [
      {
        type: 'execution.started',
        runId: 'run_1',
        seq: 1,
        timestamp: 10,
        traceId: 'trace_1',
        spanId: 'span_1',
        executionId: 'task.test',
        executionKind: 'task.invocation',
        name: 'test',
      },
      {
        type: 'execution.ended',
        runId: 'run_1',
        seq: 2,
        timestamp: 20,
        traceId: 'trace_1',
        spanId: 'span_1',
        executionId: 'task.test',
        durationMs: 10,
        status: 'ok',
      },
    ]
    expect(buildTimeline(events).entries).toHaveLength(1)
  })
})

import {
  devtoolsRuntimeHref,
  parseDevtoolsRuntimeTarget,
} from '../lib/devtools-runtime-link.js'

describe('DevTools runtime deep links', () => {
  it('traceとspanを固有URLへencodeする', () => {
    const href = devtoolsRuntimeHref('trace_a/b', 'span_x y')
    expect(href).toBe('?trace=trace_a%2Fb&span=span_x+y')
    expect(parseDevtoolsRuntimeTarget(href)).toEqual({
      traceId: 'trace_a/b',
      spanId: 'span_x y',
    })
  })

  it('traceなしのspanはdeep link targetとして採用しない', () => {
    expect(parseDevtoolsRuntimeTarget('?span=span_1')).toEqual({})
  })
})
