import type { ExecutionExtension } from '../extension.js'
import type { LifecycleHook } from '../lifecycle.js'
import type { ProviderDescriptor } from '../provider.js'

export function snapshotProvider(
  provider: ProviderDescriptor,
): ProviderDescriptor {
  if (provider.kind === 'conditional') {
    return Object.freeze({
      ...provider,
      select: Object.freeze({ ...provider.select }),
      mapping: Object.freeze({ ...provider.mapping }),
    })
  }
  if (provider.kind === 'factory') {
    return Object.freeze({
      ...provider,
      inject: Object.freeze([...provider.inject]),
    })
  }
  return Object.freeze({ ...provider })
}

export function snapshotLifecycleHook(
  hook: LifecycleHook<any>,
): LifecycleHook<any> {
  return Object.freeze({
    kind: 'lifecycle-hook',
    inject: Object.freeze([...hook.inject]),
    run: hook.run,
  })
}

export function snapshotExecutionExtension(
  extension: ExecutionExtension,
): ExecutionExtension {
  return Object.freeze({
    ...extension,
    ...(extension.host === undefined
      ? {}
      : { host: Object.freeze({ ...extension.host }) }),
  })
}
