export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | JsonObject

export interface JsonObject {
  readonly [key: string]: JsonValue
}

export function snapshotJson(
  value: unknown,
  ancestors = new Set<object>(),
): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return value
  if (typeof value !== 'object' || ancestors.has(value)) {
    throw new TypeError('JSON値に変換できません。')
  }

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return Object.freeze(
        Array.from(value, (item) => snapshotJson(item, ancestors)),
      )
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('JSONオブジェクトが必要です。')
    }
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          snapshotJson(item, ancestors),
        ]),
      ),
    )
  } finally {
    ancestors.delete(value)
  }
}

export function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
