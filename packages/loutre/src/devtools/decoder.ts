import type {
  RuntimeEvent,
  RuntimeSpanKind,
  SerializedDevtoolsError,
} from './observer.js'
import type { DevtoolsValue, DevtoolsValuePreview } from './values.js'
import { runtimeExecutionId } from '../core/identity.js'
import { epochMilliseconds, milliseconds } from '../core/units.js'
import type {
  ReplayCapsuleRequest,
  ProviderPlaygroundRequest,
  ProviderMethodInvocationRequest,
} from './inspector.js'
import {
  parseCapsuleId,
  parseRunId,
  parseSpanId,
  eventSequence,
  parseInspectorRequestId,
  parseTraceId,
} from './identity.js'
import {
  parseModelNodeId,
  parseProviderNodeId,
} from '../core/model/identity.js'

export const isDevtoolsRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function optional(
  value: Record<string, unknown>,
  names: readonly string[],
  check: (value: unknown) => boolean,
): boolean {
  return names.every((name) => value[name] === undefined || check(value[name]))
}

function jsonValue(
  value: unknown,
  ancestors = new Set<object>(),
): value is DevtoolsValue {
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value))
    return true
  if (typeof value !== 'object' || ancestors.has(value)) return false
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return false
  const next = new Set(ancestors).add(value)
  return Object.values(value).every((child) => jsonValue(child, next))
}

function preview(value: unknown): value is DevtoolsValuePreview {
  return (
    isDevtoolsRecord(value) &&
    typeof value.preview === 'string' &&
    optional(
      value,
      ['truncated', 'redacted'],
      (item) => typeof item === 'boolean',
    ) &&
    optional(value, ['type'], (item) => typeof item === 'string') &&
    (value.value === undefined || jsonValue(value.value))
  )
}

function serializedError(value: unknown): value is SerializedDevtoolsError {
  return (
    isDevtoolsRecord(value) &&
    typeof value.message === 'string' &&
    optional(value, ['name', 'stack'], (item) => typeof item === 'string')
  )
}

const spanKinds: readonly string[] = [
  'execution',
  'http.request',
  'http.middleware',
  'http.handler',
  'task.handler',
  'message-port.handler',
  'websocket.handler',
  'di.resolve',
  'provider.construct',
  'provider.method',
  'response',
  'dependency',
  'custom',
]

function replayModes(
  value: unknown,
): value is readonly ('direct' | 'transport')[] {
  return (
    Array.isArray(value) &&
    value.every((mode) => mode === 'direct' || mode === 'transport')
  )
}

function spanKind(value: unknown): value is RuntimeSpanKind {
  return typeof value === 'string' && spanKinds.includes(value)
}

export function decodeRuntimeEvent(value: unknown): RuntimeEvent | undefined {
  if (
    !isDevtoolsRecord(value) ||
    typeof value.runId !== 'string' ||
    typeof value.seq !== 'number' ||
    typeof value.timestamp !== 'number' ||
    typeof value.traceId !== 'string' ||
    typeof value.spanId !== 'string'
  )
    return undefined
  if (
    !optional(
      value,
      [
        'parentSpanId',
        'graphNodeId',
        'capsuleId',
        'replayedFromTraceId',
        'replayedFromCapsuleId',
      ],
      (item) => typeof item === 'string',
    ) ||
    !optional(value, ['replayable'], (item) => typeof item === 'boolean') ||
    !optional(value, ['attributes'], isDevtoolsRecord) ||
    !optional(value, ['input', 'result'], preview) ||
    !optional(value, ['error'], serializedError) ||
    !optional(value, ['replayModes'], replayModes)
  )
    return undefined
  const base = {
    runId: parseRunId(value.runId)!,
    seq: eventSequence(value.seq),
    timestamp: epochMilliseconds(value.timestamp),
    traceId: parseTraceId(value.traceId)!,
    spanId: parseSpanId(value.spanId)!,
    ...(typeof value.parentSpanId === 'string'
      ? { parentSpanId: parseSpanId(value.parentSpanId)! }
      : {}),
    ...(typeof value.graphNodeId === 'string'
      ? { graphNodeId: parseModelNodeId(value.graphNodeId)! }
      : {}),
    ...(typeof value.capsuleId === 'string'
      ? { capsuleId: parseCapsuleId(value.capsuleId)! }
      : {}),
    ...(typeof value.replayedFromTraceId === 'string'
      ? { replayedFromTraceId: parseTraceId(value.replayedFromTraceId)! }
      : {}),
    ...(typeof value.replayedFromCapsuleId === 'string'
      ? { replayedFromCapsuleId: parseCapsuleId(value.replayedFromCapsuleId)! }
      : {}),
    ...(typeof value.replayable === 'boolean'
      ? { replayable: value.replayable }
      : {}),
    ...(isDevtoolsRecord(value.attributes)
      ? { attributes: value.attributes }
      : {}),
    ...(preview(value.input) ? { input: value.input } : {}),
    ...(preview(value.result) ? { result: value.result } : {}),
    ...(serializedError(value.error) ? { error: value.error } : {}),
    ...(replayModes(value.replayModes)
      ? { replayModes: value.replayModes }
      : {}),
  }
  switch (value.type) {
    case 'execution.started':
      if (
        typeof value.executionId !== 'string' ||
        typeof value.executionKind !== 'string' ||
        typeof value.name !== 'string'
      )
        return undefined
      return {
        ...base,
        type: value.type,
        executionId: runtimeExecutionId(value.executionId),
        executionKind: value.executionKind,
        name: value.name,
      }
    case 'span.started':
      if (typeof value.name !== 'string' || !spanKind(value.kind))
        return undefined
      return { ...base, type: value.type, kind: value.kind, name: value.name }
    case 'execution.ended':
      if (typeof value.executionId !== 'string') return undefined
      if (
        typeof value.durationMs !== 'number' ||
        (value.status !== 'ok' &&
          value.status !== 'error' &&
          value.status !== 'cancelled')
      )
        return undefined
      return {
        ...base,
        type: value.type,
        executionId: runtimeExecutionId(value.executionId),
        durationMs: milliseconds(value.durationMs),
        status: value.status,
      }
    case 'span.ended':
      if (
        typeof value.durationMs !== 'number' ||
        (value.status !== 'ok' &&
          value.status !== 'error' &&
          value.status !== 'cancelled')
      )
        return undefined
      return {
        ...base,
        type: value.type,
        durationMs: milliseconds(value.durationMs),
        status: value.status,
      }
    default:
      return undefined
  }
}

export type InspectorCommand =
  | {
      readonly type: 'command.replay-capsule'
      readonly request: ReplayCapsuleRequest
    }
  | {
      readonly type: 'command.provider-playground'
      readonly request: ProviderPlaygroundRequest
    }
  | {
      readonly type: 'command.invoke-provider-method'
      readonly request: ProviderMethodInvocationRequest
    }

export function decodeInspectorCommand(
  value: unknown,
): InspectorCommand | undefined {
  if (!isDevtoolsRecord(value) || !isDevtoolsRecord(value.request))
    return undefined
  const body = value.request
  const requestId = parseInspectorRequestId(body.requestId)
  if (requestId === undefined) return undefined
  if (value.type === 'command.replay-capsule') {
    const capsuleId = parseCapsuleId(body.capsuleId)
    if (
      capsuleId === undefined ||
      !optional(body, ['parentTraceId'], (item) => typeof item === 'string')
    )
      return undefined
    return {
      type: value.type,
      request: {
        requestId,
        capsuleId,
        ...('inputOverride' in body
          ? { inputOverride: body.inputOverride }
          : {}),
        ...(body.parentTraceId === undefined
          ? {}
          : { parentTraceId: parseTraceId(body.parentTraceId)! }),
      },
    }
  }
  const graphNodeId = parseProviderNodeId(body.graphNodeId)
  if (graphNodeId === undefined) return undefined
  if (value.type === 'command.provider-playground')
    return { type: value.type, request: { requestId, graphNodeId } }
  if (
    value.type === 'command.invoke-provider-method' &&
    typeof body.method === 'string' &&
    Array.isArray(body.args)
  )
    return {
      type: value.type,
      request: { requestId, graphNodeId, method: body.method, args: body.args },
    }
  return undefined
}
