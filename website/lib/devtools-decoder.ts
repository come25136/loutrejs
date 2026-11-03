import {
  runId,
  parseTraceId,
  parseSpanId,
  capsuleId,
  inspectorRequestId,
  eventSequence,
  epochMs,
  durationMs,
  runtimeExecutionId,
  modelNodeId,
  providerNodeId,
} from './devtools-identity'
import type {
  RuntimeEvent,
  DevtoolsRun,
  DevtoolsTraceSummary,
  ProviderPlaygroundDescriptor,
  ProviderMethodInvocationResult,
  DevtoolsValuePreview,
  ExecutionEndedEvent,
  ProviderPlaygroundMethod,
} from './devtools-runtime'

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
export function optional(
  value: Record<string, unknown>,
  fields: readonly string[],
  validate: (item: unknown) => boolean,
): boolean {
  return fields.every(
    (field) => value[field] === undefined || validate(value[field]),
  )
}
const text = (value: unknown) => typeof value === 'string'
const numeric = (value: unknown) => typeof value === 'number'
function preview(value: unknown): value is DevtoolsValuePreview {
  return (
    isRecord(value) &&
    text(value.preview) &&
    optional(
      value,
      ['truncated', 'redacted'],
      (item) => typeof item === 'boolean',
    ) &&
    optional(value, ['type'], text)
  )
}
function error(
  value: unknown,
): value is NonNullable<ExecutionEndedEvent['error']> {
  return (
    isRecord(value) &&
    text(value.message) &&
    optional(value, ['name', 'stack'], text)
  )
}
function runtimeOptionals(value: Record<string, unknown>): boolean {
  return (
    optional(
      value,
      [
        'graphNodeId',
        'parentSpanId',
        'capsuleId',
        'replayedFromTraceId',
        'replayedFromCapsuleId',
      ],
      text,
    ) &&
    optional(value, ['durationMs'], numeric) &&
    optional(value, ['input', 'result'], preview) &&
    optional(value, ['error'], error) &&
    optional(value, ['attributes'], isRecord) &&
    optional(value, ['replayable'], (item) => typeof item === 'boolean') &&
    optional(value, ['replayModes'], replayModes)
  )
}
function replayModes(
  value: unknown,
): value is readonly ('direct' | 'transport')[] {
  return (
    Array.isArray(value) &&
    value.every((mode) => mode === 'direct' || mode === 'transport')
  )
}
function runtimeFields(value: Record<string, unknown>) {
  return {
    ...(text(value.parentSpanId)
      ? { parentSpanId: parseSpanId(value.parentSpanId) }
      : {}),
    ...(text(value.graphNodeId)
      ? { graphNodeId: modelNodeId(value.graphNodeId) }
      : {}),
    ...(text(value.capsuleId) ? { capsuleId: capsuleId(value.capsuleId) } : {}),
    ...(text(value.replayedFromTraceId)
      ? { replayedFromTraceId: parseTraceId(value.replayedFromTraceId) }
      : {}),
    ...(text(value.replayedFromCapsuleId)
      ? { replayedFromCapsuleId: capsuleId(value.replayedFromCapsuleId) }
      : {}),
    ...(typeof value.replayable === 'boolean'
      ? { replayable: value.replayable }
      : {}),
    ...(numeric(value.durationMs)
      ? { durationMs: durationMs(value.durationMs) }
      : {}),
    ...(isRecord(value.attributes) ? { attributes: value.attributes } : {}),
    ...(preview(value.input) ? { input: value.input } : {}),
    ...(preview(value.result) ? { result: value.result } : {}),
    ...(error(value.error) ? { error: value.error } : {}),
    ...(replayModes(value.replayModes)
      ? { replayModes: value.replayModes }
      : {}),
  }
}
export function parseRuntimeEvent<const Kind extends RuntimeEvent['type']>(
  value: { readonly type: Kind } & Readonly<Record<string, unknown>>,
): Extract<RuntimeEvent, { type: Kind }>
export function parseRuntimeEvent(value: unknown): RuntimeEvent
export function parseRuntimeEvent(value: unknown): RuntimeEvent {
  if (
    !isRecord(value) ||
    !text(value.runId) ||
    !text(value.traceId) ||
    !text(value.spanId) ||
    !numeric(value.seq) ||
    !numeric(value.timestamp) ||
    !runtimeOptionals(value)
  )
    throw new Error('Invalid runtime event.')
  const base = {
    ...runtimeFields(value),
    runId: runId(value.runId),
    seq: eventSequence(value.seq),
    timestamp: epochMs(value.timestamp),
    traceId: parseTraceId(value.traceId),
    spanId: parseSpanId(value.spanId),
  }
  switch (value.type) {
    case 'execution.started':
      if (
        !text(value.executionId) ||
        !text(value.executionKind) ||
        !text(value.name)
      )
        throw new Error('Invalid execution start.')
      return {
        ...base,
        type: value.type,
        executionId: runtimeExecutionId(value.executionId),
        executionKind: value.executionKind,
        name: value.name,
      }
    case 'span.started':
      if (!text(value.kind) || !text(value.name))
        throw new Error('Invalid span start.')
      return { ...base, type: value.type, kind: value.kind, name: value.name }
    case 'execution.ended':
      if (
        !text(value.executionId) ||
        !numeric(value.durationMs) ||
        (value.status !== 'ok' &&
          value.status !== 'error' &&
          value.status !== 'cancelled')
      )
        throw new Error('Invalid runtime end.')
      return {
        ...base,
        type: value.type,
        executionId: runtimeExecutionId(value.executionId),
        durationMs: durationMs(value.durationMs),
        status: value.status,
      }
    case 'span.ended':
      if (
        !numeric(value.durationMs) ||
        (value.status !== 'ok' &&
          value.status !== 'error' &&
          value.status !== 'cancelled')
      )
        throw new Error('Invalid runtime end.')
      return {
        ...base,
        type: value.type,
        durationMs: durationMs(value.durationMs),
        status: value.status,
      }
    default:
      throw new Error('Invalid runtime event type.')
  }
}
export function parseRuntimeEvents(value: unknown): readonly RuntimeEvent[] {
  if (!Array.isArray(value)) throw new Error('Invalid runtime events.')
  return value.map(parseRuntimeEvent)
}
export function parseRun(value: unknown): DevtoolsRun {
  if (
    !isRecord(value) ||
    !text(value.runId) ||
    !numeric(value.connectedAt) ||
    !optional(value, ['stoppedAt'], numeric) ||
    !isRecord(value.application) ||
    !optional(value.application, ['name', 'runtime'], text) ||
    !optional(value.application, ['pid'], numeric)
  )
    throw new Error('Invalid runtime run.')
  return {
    runId: runId(value.runId),
    connectedAt: epochMs(value.connectedAt),
    ...(numeric(value.stoppedAt)
      ? { stoppedAt: epochMs(value.stoppedAt) }
      : {}),
    application: {
      ...(text(value.application.name) ? { name: value.application.name } : {}),
      ...(text(value.application.runtime)
        ? { runtime: value.application.runtime }
        : {}),
      ...(numeric(value.application.pid) ? { pid: value.application.pid } : {}),
    },
  }
}
export function parseTraceSummary(value: unknown): DevtoolsTraceSummary {
  if (
    !isRecord(value) ||
    !text(value.traceId) ||
    !text(value.runId) ||
    !text(value.executionId) ||
    !text(value.executionKind) ||
    !text(value.name) ||
    !numeric(value.startedAt) ||
    (value.status !== 'running' &&
      value.status !== 'ok' &&
      value.status !== 'error' &&
      value.status !== 'cancelled') ||
    !runtimeOptionals(value)
  )
    throw new Error('Invalid runtime trace.')
  return {
    ...runtimeFields(value),
    traceId: parseTraceId(value.traceId),
    runId: runId(value.runId),
    executionId: runtimeExecutionId(value.executionId),
    executionKind: value.executionKind,
    name: value.name,
    startedAt: epochMs(value.startedAt),
    status: value.status,
  }
}
export function parseInvocationResult(
  value: unknown,
): ProviderMethodInvocationResult {
  if (
    !isRecord(value) ||
    !text(value.requestId) ||
    (value.status !== 'ok' && value.status !== 'error') ||
    !optional(value, ['traceId'], text) ||
    !optional(value, ['result'], preview) ||
    !optional(value, ['error'], error)
  )
    throw new Error('Invalid invocation result.')
  return {
    requestId: inspectorRequestId(value.requestId),
    status: value.status,
    ...(text(value.traceId) ? { traceId: parseTraceId(value.traceId) } : {}),
    ...(preview(value.result) ? { result: value.result } : {}),
    ...(error(value.error) ? { error: value.error } : {}),
  }
}
export function parseProviderPlayground(
  value: unknown,
): ProviderPlaygroundDescriptor {
  if (
    !isRecord(value) ||
    !text(value.requestId) ||
    !text(value.graphNodeId) ||
    !text(value.providerName) ||
    !Array.isArray(value.methods) ||
    !value.methods.every(isProviderMethod)
  )
    throw new Error('Invalid Provider Playground response.')
  return {
    requestId: inspectorRequestId(value.requestId),
    graphNodeId: providerNodeId(value.graphNodeId),
    providerName: value.providerName,
    methods: value.methods.map((method) => ({
      name: method.name,
      arity: method.arity,
    })),
  }
}

function isProviderMethod(value: unknown): value is ProviderPlaygroundMethod {
  return isRecord(value) && text(value.name) && numeric(value.arity)
}
