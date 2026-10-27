import {
  decodeRuntimeEvent,
  decodeInspectorCommand,
  parseRunId,
} from '@loutrejs/loutre/devtools'
import { attachMessagePort } from '@loutrejs/loutre/message-port'

const event = {
  type: 'execution.started',
  runId: 'custom/session.1',
  seq: 1,
  timestamp: 100,
  traceId: 'custom trace',
  spanId: 'custom span',
  executionId: 'task.test',
  executionKind: 'task.invocation',
  name: 'test',
  capsuleId: 'custom/capsule',
}

describe('DevToolsの受信境界', () => {
  it('任意形式のIDとJSON表現を維持する', () => {
    const decoded = decodeRuntimeEvent(JSON.parse(JSON.stringify(event)))
    expect(decoded).toEqual(event)
    expect(parseRunId(' arbitrary/session ')).toBe(' arbitrary/session ')
    expect(parseRunId(1)).toBeUndefined()
  })

  it.each([
    'parentSpanId',
    'graphNodeId',
    'capsuleId',
    'replayedFromTraceId',
    'replayedFromCapsuleId',
  ])('optionalな%sも検証する', (field) => {
    expect(decodeRuntimeEvent({ ...event, [field]: 12 })).toBeUndefined()
  })

  it('eventの種類ごとの必須fieldとpreviewを検証する', () => {
    expect(decodeRuntimeEvent({ ...event, name: undefined })).toBeUndefined()
    expect(
      decodeRuntimeEvent({
        ...event,
        type: 'execution.ended',
        durationMs: 1,
        status: 'other',
      }),
    ).toBeUndefined()
    expect(
      decodeRuntimeEvent({
        ...event,
        input: { preview: 'input', truncated: 'yes' },
      }),
    ).toBeUndefined()
    expect(
      decodeRuntimeEvent({
        ...event,
        input: { preview: 'input', value: { missing: undefined } },
      }),
    ).toBeUndefined()
  })

  it.each([
    {
      type: 'execution.started',
      executionId: 'task.example',
      executionKind: 'task.invocation',
      name: 'example',
      capsuleId: 'capsule',
      replayable: true,
      replayModes: ['direct'],
      replayedFromTraceId: 'parent-trace',
      replayedFromCapsuleId: 'parent-capsule',
      input: { preview: 'input', value: { id: 1 }, truncated: false },
    },
    {
      type: 'span.started',
      kind: 'http.handler',
      name: 'example',
      attributes: { route: '/example' },
      input: { preview: 'input', redacted: true },
    },
    {
      type: 'execution.ended',
      executionId: 'task.example',
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
    expect(decodeRuntimeEvent(JSON.parse(JSON.stringify(wire)))).toEqual(wire)
  })

  it('Inspectorのoptionalな親Traceを検証する', () => {
    const command = {
      type: 'command.replay-capsule',
      request: { requestId: 'request', capsuleId: 'capsule' },
    }
    expect(decodeInspectorCommand(command)).toEqual(command)
    expect(
      decodeInspectorCommand({
        ...command,
        request: { ...command.request, parentTraceId: 1 },
      }),
    ).toBeUndefined()
  })
})

describe('MessagePortの受信境界', () => {
  it('不正なenvelopeをhandlerへ渡さず、正規のIDを応答へ引き継ぐ', async () => {
    let receive!: (event: { readonly data: unknown }) => void
    const invoke = vi.fn(async () => ({ response: 'ok', value: 42 }))
    const postMessage = vi.fn()
    attachMessagePort(
      { invoke },
      {
        postMessage,
        addEventListener(_type, listener) {
          receive = listener
        },
      },
    )
    await receive({ data: { id: 1, procedure: 'read' } })
    await receive({ data: { id: 'request', procedure: false } })
    expect(invoke).not.toHaveBeenCalled()
    await receive({ data: { id: 'custom request', procedure: 'read' } })
    expect(invoke).toHaveBeenCalledWith('read', undefined)
    expect(postMessage).toHaveBeenCalledWith({
      id: 'custom request',
      response: 'ok',
      value: 42,
      done: true,
    })
  })
})
