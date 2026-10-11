import {
  isNonNullType,
  isListType,
  isInputObjectType,
  type GraphQLInputType,
  type GraphQLArgument,
} from 'graphql'

export function normalizeArguments(
  value: unknown,
  seen = new Set<object>(),
): string | undefined {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value))
    return Object.is(value, -0) ? '-0' : String(value)
  if (typeof value !== 'object' || value === null || seen.has(value))
    return undefined
  const next = new Set([...seen, value])
  if (Array.isArray(value)) {
    const parts = value.map((item) => normalizeArguments(item, next))
    return parts.every((part) => part !== undefined)
      ? `[${parts.join(',')}]`
      : undefined
  }
  if ([Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    const keys = Reflect.ownKeys(value)
    if (
      keys.some(
        (key) =>
          typeof key !== 'string' ||
          !Object.getOwnPropertyDescriptor(value, key)!.enumerable,
      )
    )
      return undefined
    const parts = (keys as string[]).toSorted().map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!
      const part =
        'value' in descriptor
          ? normalizeArguments(descriptor.value, next)
          : undefined
      return part === undefined ? undefined : `${JSON.stringify(key)}:${part}`
    })
    return parts.every((part) => part !== undefined)
      ? `{${parts.join(',')}}`
      : undefined
  }
  return undefined
}
function opaqueInput(value: unknown, type: GraphQLInputType): boolean {
  if (value == null) return false
  if (isNonNullType(type)) return opaqueInput(value, type.ofType)
  if (isListType(type))
    return (
      !Array.isArray(value) ||
      value.some((item) => opaqueInput(item, type.ofType))
    )
  if (isInputObjectType(type) && typeof value === 'object') {
    return Object.values(type.getFields()).some((field) =>
      opaqueInput((value as Record<string, unknown>)[field.name], field.type),
    )
  }
  return typeof value === 'object' || typeof value === 'function'
}
export function normalizeFieldArguments(
  args: Readonly<Record<string, unknown>>,
  definitions: readonly GraphQLArgument[],
): string | undefined {
  if (
    definitions.some((argument) =>
      opaqueInput(args[argument.name], argument.type),
    )
  )
    return undefined
  return normalizeArguments(args)
}
