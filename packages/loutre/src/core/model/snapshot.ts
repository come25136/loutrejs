import { match } from 'ts-pattern'
import type { ExecutionExtension } from '../extension.js'
import type { LifecycleHook } from '../lifecycle.js'
import type { ProviderDescriptor } from '../provider.js'

export function snapshotProvider(
  provider: ProviderDescriptor,
): ProviderDescriptor {
  return match(provider)
    .returnType<ProviderDescriptor>()
    .with({ kind: 'conditional' }, (value) =>
      Object.freeze({
        ...value,
        select: Object.freeze({ ...value.select }),
        mapping: Object.freeze({ ...value.mapping }),
      }),
    )
    .with({ kind: 'factory' }, (value) =>
      Object.freeze({ ...value, inject: Object.freeze([...value.inject]) }),
    )
    .with(
      { kind: 'class' },
      { kind: 'value' },
      { kind: 'environment' },
      { kind: 'arguments' },
      (value) => Object.freeze({ ...value }),
    )
    .exhaustive()
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
