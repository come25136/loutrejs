export type RuntimeCapabilityId = string

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
  required: Iterable<RuntimeCapabilityId>,
  runtime: RuntimeSupportProfile,
): RuntimeSupportCheck {
  const requirements = [...new Set(required)]
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
