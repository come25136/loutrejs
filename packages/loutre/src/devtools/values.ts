import { match } from 'ts-pattern'

export type DevtoolsValue =
  | null
  | boolean
  | number
  | string
  | { readonly $type: 'undefined' }
  | { readonly $type: 'bigint'; readonly value: string }
  | { readonly $type: 'date'; readonly value: string }
  | { readonly $type: 'bytes'; readonly base64: string }
  | {
      readonly $type: 'map'
      readonly entries: readonly [DevtoolsValue, DevtoolsValue][]
    }
  | { readonly $type: 'set'; readonly values: readonly DevtoolsValue[] }
  | { readonly $type: 'redacted' }
  | readonly DevtoolsValue[]
  | { readonly [key: string]: DevtoolsValue }

export interface DevtoolsValuePreview {
  readonly value?: DevtoolsValue
  readonly preview: string
  readonly truncated?: boolean
  readonly redacted?: boolean
  readonly type?: string
}

export interface DevtoolsValuePreviewOptions {
  readonly maxValueBytes?: number
  readonly maxDepth?: number
  readonly redact?: readonly string[]
}

const defaultMaxValueBytes = 64 * 1024
const defaultMaxDepth = 8

export function previewDevtoolsValue(
  value: unknown,
  options: DevtoolsValuePreviewOptions = {},
): DevtoolsValuePreview {
  const maxValueBytes = options.maxValueBytes ?? defaultMaxValueBytes
  const maxDepth = options.maxDepth ?? defaultMaxDepth
  const redactions = new Set(
    (options.redact ?? []).map((entry) => entry.trim().toLowerCase()),
  )
  let redacted = false
  let truncated = false
  const seen = new WeakSet<object>()

  const encode = (
    current: unknown,
    depth: number,
    path: readonly string[],
  ): DevtoolsValue => {
    if (depth > maxDepth) {
      truncated = true
      return '[Truncated]'
    }
    if (current === null) return null
    switch (typeof current) {
      case 'boolean':
      case 'number':
      case 'string':
        return current
      case 'undefined':
        return { $type: 'undefined' }
      case 'bigint':
        return { $type: 'bigint', value: current.toString() }
      case 'function':
      case 'symbol':
        truncated = true
        return `[${typeof current}]`
      case 'object':
        break
    }

    if (current instanceof Date) {
      return { $type: 'date', value: current.toISOString() }
    }
    if (current instanceof Uint8Array) {
      return { $type: 'bytes', base64: bytesToBase64(current) }
    }
    if (seen.has(current)) {
      truncated = true
      return '[Circular]'
    }
    seen.add(current)
    try {
      if (Array.isArray(current)) {
        const output: DevtoolsValue[] = []
        const descriptors = Object.getOwnPropertyDescriptors(current)
        for (let index = 0; index < current.length; index += 1) {
          const descriptor = descriptors[String(index)]
          if (!descriptor) {
            output.length = index + 1
            continue
          }
          if (!('value' in descriptor)) {
            truncated = true
            output[index] = '[Accessor]'
            continue
          }
          output[index] = encode(descriptor.value, depth + 1, [
            ...path,
            String(index),
          ])
        }
        return output
      }
      if (current instanceof Map) {
        return {
          $type: 'map',
          entries: [...current.entries()].map(([key, item], index) => [
            encode(key, depth + 1, [...path, String(index), 'key']),
            encode(item, depth + 1, [...path, String(index), 'value']),
          ]),
        }
      }
      if (current instanceof Set) {
        return {
          $type: 'set',
          values: [...current.values()].map((item, index) =>
            encode(item, depth + 1, [...path, String(index)]),
          ),
        }
      }
      const output: Record<string, DevtoolsValue> = {}
      for (const [key, descriptor] of Object.entries(
        Object.getOwnPropertyDescriptors(current),
      )) {
        if (!descriptor.enumerable) continue
        const nextPath = [...path, key]
        if (shouldRedact(key, nextPath, redactions)) {
          redacted = true
          output[key] = { $type: 'redacted' }
          continue
        }
        if (!('value' in descriptor)) {
          truncated = true
          output[key] = '[Accessor]'
          continue
        }
        output[key] = encode(descriptor.value, depth + 1, nextPath)
      }
      return output
    } finally {
      seen.delete(current)
    }
  }

  try {
    const encoded = encode(value, 0, [])
    const serialized = JSON.stringify(encoded)
    const bytes = utf8ByteLength(serialized)
    const preview =
      serialized.length > 512 ? `${serialized.slice(0, 509)}...` : serialized
    if (bytes > maxValueBytes) {
      return {
        preview,
        truncated: true,
        ...(redacted ? { redacted: true } : {}),
        type: valueType(value),
      }
    }
    return {
      value: encoded,
      preview,
      ...(truncated ? { truncated: true } : {}),
      ...(redacted ? { redacted: true } : {}),
      type: valueType(value),
    }
  } catch {
    const type = safeValueType(value)
    return {
      preview: `[${type}]`,
      truncated: true,
      type,
    }
  }
}

function shouldRedact(
  key: string,
  path: readonly string[],
  redactions: ReadonlySet<string>,
): boolean {
  if (redactions.size === 0) return false
  const normalizedKey = key.toLowerCase()
  const normalizedPath = path.join('.').toLowerCase()
  return redactions.has(normalizedKey) || redactions.has(normalizedPath)
}

function valueType(value: unknown): string {
  return match(value)
    .with(null, () => 'null')
    .when(Array.isArray, () => 'array')
    .when(
      (candidate): candidate is Date => candidate instanceof Date,
      () => 'date',
    )
    .when(
      (candidate): candidate is Uint8Array => candidate instanceof Uint8Array,
      () => 'bytes',
    )
    .when(
      (candidate): candidate is Map<unknown, unknown> =>
        candidate instanceof Map,
      () => 'map',
    )
    .when(
      (candidate): candidate is Set<unknown> => candidate instanceof Set,
      () => 'set',
    )
    .when(
      (candidate) => typeof candidate === 'object',
      () => 'object',
    )
    .otherwise((candidate) => typeof candidate)
}

function safeValueType(value: unknown): string {
  try {
    return valueType(value)
  } catch {
    return typeof value
  }
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function bytesToBase64(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  const encoder = globalThis.btoa
  if (typeof encoder === 'function') return encoder(binary)
  return binary
}
