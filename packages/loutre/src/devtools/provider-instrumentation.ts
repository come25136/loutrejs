export interface ProviderMethodInvocation {
  readonly key: PropertyKey
  readonly name: string
  readonly original: Function
  readonly receiver: unknown
  readonly args: readonly unknown[]
}

export interface ProviderMethodDefinition {
  readonly key: PropertyKey
  readonly name: string
  readonly original: Function
}

export function discoverProviderMethods(
  instance: object,
): readonly ProviderMethodDefinition[] {
  const methods: ProviderMethodDefinition[] = []
  const seen = new Set<PropertyKey>()

  const collect = (target: object) => {
    for (const key of Reflect.ownKeys(target)) {
      if (key === 'constructor' || seen.has(key)) continue
      const descriptor = Object.getOwnPropertyDescriptor(target, key)
      if (!descriptor || !('value' in descriptor)) continue
      if (typeof descriptor.value !== 'function') continue
      seen.add(key)
      methods.push({
        key,
        name: methodName(key),
        original: descriptor.value,
      })
    }
  }

  collect(instance)
  let prototype = Object.getPrototypeOf(instance) as object | null
  while (prototype && prototype !== Object.prototype) {
    collect(prototype)
    prototype = Object.getPrototypeOf(prototype) as object | null
  }

  return methods
}

export function instrumentProviderMethods(
  instance: object,
  invoke: (invocation: ProviderMethodInvocation) => unknown,
): () => void {
  const seen = new Set<PropertyKey>()
  const restore: (() => void)[] = []

  for (const key of Reflect.ownKeys(instance)) {
    const descriptor = Object.getOwnPropertyDescriptor(instance, key)
    if (!descriptor || !('value' in descriptor)) continue
    if (typeof descriptor.value !== 'function') continue
    if (!descriptor.configurable && descriptor.writable !== true) continue
    seen.add(key)
    const cleanup = defineWrapper(
      instance,
      key,
      descriptor,
      descriptor.value,
      invoke,
    )
    if (cleanup) restore.push(cleanup)
  }

  if (!Object.isExtensible(instance)) {
    return () => {
      for (const cleanup of restore.toReversed()) cleanup()
    }
  }
  let prototype = Object.getPrototypeOf(instance) as object | null
  while (prototype && prototype !== Object.prototype) {
    for (const key of Reflect.ownKeys(prototype)) {
      if (key === 'constructor' || seen.has(key)) continue
      const descriptor = Object.getOwnPropertyDescriptor(prototype, key)
      if (!descriptor || !('value' in descriptor)) continue
      if (typeof descriptor.value !== 'function') continue
      seen.add(key)
      const cleanup = defineWrapper(
        instance,
        key,
        {
          configurable: true,
          enumerable: descriptor.enumerable ?? false,
          writable: true,
          value: descriptor.value,
        },
        descriptor.value,
        invoke,
        true,
      )
      if (cleanup) restore.push(cleanup)
    }
    prototype = Object.getPrototypeOf(prototype) as object | null
  }

  return () => {
    for (const cleanup of restore.toReversed()) cleanup()
  }
}

function defineWrapper(
  instance: object,
  key: PropertyKey,
  descriptor: PropertyDescriptor,
  original: Function,
  invoke: (invocation: ProviderMethodInvocation) => unknown,
  shadowsPrototype = false,
): (() => void) | undefined {
  const wrapper = function (this: unknown, ...args: unknown[]) {
    return invoke({
      key,
      name: methodName(key),
      original,
      receiver: this,
      args,
    })
  }
  try {
    Object.defineProperty(instance, key, {
      ...descriptor,
      value: wrapper,
    })
  } catch {
    // instrumentationのために変更不能なProviderを壊してはならない。
    return undefined
  }

  return () => {
    try {
      const current = Object.getOwnPropertyDescriptor(instance, key)
      if (!current || !('value' in current) || current.value !== wrapper) return
      if (shadowsPrototype)
        delete (instance as Record<PropertyKey, unknown>)[key]
      else Object.defineProperty(instance, key, descriptor)
    } catch {
      // Application側の変更をcleanupで上書きしてはならない。
    }
  }
}

function methodName(key: PropertyKey): string {
  if (typeof key === 'symbol') return key.description ?? key.toString()
  return String(key)
}
