export interface DevtoolsRuntimeTarget {
  readonly traceId?: string
  readonly spanId?: string
}

export function parseDevtoolsRuntimeTarget(
  search: string,
): DevtoolsRuntimeTarget {
  const params = new URLSearchParams(search)
  const traceId = nonEmpty(params.get('trace'))
  if (!traceId) return {}
  const spanId = nonEmpty(params.get('span'))
  return {
    traceId,
    ...(spanId === undefined ? {} : { spanId }),
  }
}

export function devtoolsRuntimeHref(traceId: string, spanId?: string): string {
  const params = new URLSearchParams()
  params.set('trace', traceId)
  if (spanId) params.set('span', spanId)
  return `?${params.toString()}`
}

function nonEmpty(value: string | null): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}
