import {
  parseTraceId,
  parseSpanId,
  runtimeDeepLink,
  type TraceId,
  type SpanId,
  type RuntimeDeepLink,
} from './devtools-identity'
export interface DevtoolsRuntimeTarget {
  readonly traceId?: TraceId
  readonly spanId?: SpanId
}

export function parseDevtoolsRuntimeTarget(
  search: string,
): DevtoolsRuntimeTarget {
  const params = new URLSearchParams(search)
  const traceId = nonEmpty(params.get('trace'))
  if (!traceId) return {}
  const spanId = nonEmpty(params.get('span'))
  return {
    traceId: parseTraceId(traceId),
    ...(spanId === undefined ? {} : { spanId: parseSpanId(spanId) }),
  }
}

export function devtoolsRuntimeHref(
  traceId: TraceId,
  spanId?: SpanId,
): RuntimeDeepLink {
  return runtimeDeepLink(traceId, spanId)
}

function nonEmpty(value: string | null): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}
