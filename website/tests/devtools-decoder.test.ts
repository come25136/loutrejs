import { describe, expect, it } from 'vitest'
import {
  parseRuntimeEvent,
  parseRun,
  parseTraceSummary,
  parseInvocationResult,
  parseProviderPlayground,
} from '../lib/devtools-decoder'
import { parseGraphSnapshot } from '../lib/devtools'

const event = {
  type: 'span.started',
  runId: 'run',
  seq: 2,
  timestamp: 100,
  traceId: 'trace',
  spanId: 'span',
  kind: 'provider.method',
  name: 'read',
}

describe('BrowserのDevTools decoder', () => {
  it('eventを受信した後もwireの値を維持する', () => {
    expect(parseRuntimeEvent(event)).toEqual(event)
  })
  it.each([
    'parentSpanId',
    'graphNodeId',
    'capsuleId',
    'replayedFromTraceId',
    'replayedFromCapsuleId',
  ])('optionalな%sを無検証で受け入れない', (field) => {
    expect(() => parseRuntimeEvent({ ...event, [field]: 42 })).toThrow()
  })
  it.each([
    {
      type: 'execution.started',
      executionId: 'http.example',
      executionKind: 'http.request',
      name: 'example',
      capsuleId: 'capsule',
      replayable: true,
      replayModes: ['direct'],
      replayedFromTraceId: 'parent-trace',
      replayedFromCapsuleId: 'parent-capsule',
      input: { preview: 'input', value: { id: 1 }, truncated: false },
    },
    {
      type: 'execution.ended',
      executionId: 'http.example',
      durationMs: 12,
      status: 'error',
      error: { name: 'Error', message: 'failure', stack: 'stack' },
      result: { preview: 'result', value: 3 },
    },
    {
      type: 'span.ended',
      durationMs: 4,
      status: 'cancelled',
      attributes: { reason: 'shutdown' },
      result: { preview: 'result', value: null },
    },
  ])('$typeの識別子・単位・optional fieldをdecode後も保持する', (fields) => {
    const wire = {
      runId: 'run',
      traceId: 'trace',
      spanId: 'span',
      seq: 1,
      timestamp: 100,
      graphNodeId: 'execution',
      parentSpanId: 'parent',
      ...fields,
    }
    expect(parseRuntimeEvent(JSON.parse(JSON.stringify(wire)))).toEqual(wire)
  })
  it('Run・Trace・操作結果・Providerの値をdecode後も保持する', () => {
    const run = {
      runId: 'run',
      connectedAt: 100,
      stoppedAt: 200,
      application: { name: 'example', runtime: 'node', pid: 1 },
    }
    expect(parseRun(run)).toEqual(run)
    const trace = {
      runId: 'run',
      traceId: 'trace',
      executionId: 'http.example',
      executionKind: 'http.request',
      name: 'example',
      startedAt: 100,
      durationMs: 12,
      status: 'ok',
      graphNodeId: 'execution',
      capsuleId: 'capsule',
      replayable: true,
      replayModes: ['direct'],
      replayedFromTraceId: 'parent-trace',
      replayedFromCapsuleId: 'parent-capsule',
      input: { preview: 'input', value: 1 },
      attributes: { method: 'GET' },
    }
    expect(parseTraceSummary(trace)).toEqual(trace)
    const invocation = {
      requestId: 'request',
      traceId: 'trace',
      status: 'error',
      result: { preview: 'result', value: 3 },
      error: { name: 'Error', message: 'failure', stack: 'stack' },
    }
    expect(parseInvocationResult(invocation)).toEqual(invocation)
    const provider = {
      requestId: 'request',
      graphNodeId: 'provider',
      providerName: 'Example',
      methods: [{ name: 'run', arity: 2 }],
    }
    expect(parseProviderPlayground(provider)).toEqual(provider)
  })
  it('summaryと操作結果のfieldを検証する', () => {
    expect(() => parseTraceSummary({ traceId: 'trace' })).toThrow()
    expect(() =>
      parseInvocationResult({
        requestId: 'request',
        status: 'ok',
        traceId: 42,
      }),
    ).toThrow()
    expect(() =>
      parseProviderPlayground({
        requestId: 'request',
        graphNodeId: 'provider',
        providerName: 'Test',
        methods: [{ name: 'read', arity: '1' }],
      }),
    ).toThrow()
  })
  it('Graph nodeのoptionalな所属先も検証する', () => {
    expect(() =>
      parseGraphSnapshot({
        schemaVersion: 1,
        nodes: [
          { id: 'provider', kind: 'provider', label: 'Test', module: 42 },
        ],
        edges: [],
        diagnostics: [],
      }),
    ).toThrow()
  })
})
