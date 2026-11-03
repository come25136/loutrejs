import type { Brand } from '../internal/brand.js'
export type RuntimeSupportFeature = Brand<string, 'runtime.support-feature'>
export const runtimeSupportFeature = (value: string): RuntimeSupportFeature =>
  value as RuntimeSupportFeature
export const runtimeSupportFeatures = (
  values: Iterable<string>,
): ReadonlySet<RuntimeSupportFeature> =>
  new Set([...values].map(runtimeSupportFeature))
export type RuntimeCapabilityId = RuntimeSupportFeature

export interface RuntimeSupportProfile {
  readonly runtime: string
  readonly capabilities: ReadonlySet<RuntimeCapabilityId>
}

export interface RuntimeSupportCheck {
  readonly ok: boolean
  readonly required: readonly RuntimeCapabilityId[]
  readonly supported: readonly RuntimeCapabilityId[]
  readonly missing: readonly RuntimeCapabilityId[]
}

export function checkRuntimeSupport(
  required: Iterable<string>,
  runtime: RuntimeSupportProfile,
): RuntimeSupportCheck {
  const requirements = [...runtimeSupportFeatures(required)]
  const missing = requirements.filter(
    (capability) => !runtime.capabilities.has(capability),
  )
  return {
    ok: missing.length === 0,
    required: requirements,
    supported: [...runtime.capabilities],
    missing,
  }
}

export class MissingRuntimeSupportError extends Error {
  constructor(readonly check: RuntimeSupportCheck) {
    super(
      `Runtime is missing required capabilities: ${check.missing.join(', ')}`,
    )
    this.name = 'MissingRuntimeSupportError'
  }
}
