export type RuntimeCapability = string

export interface RuntimeCapabilities {
  readonly runtime: string
  readonly capabilities: ReadonlySet<RuntimeCapability>
}

export interface CapabilityCheck {
  readonly ok: boolean
  readonly required: readonly RuntimeCapability[]
  readonly supported: readonly RuntimeCapability[]
  readonly missing: readonly RuntimeCapability[]
}

export function checkCapabilities(
  required: Iterable<RuntimeCapability>,
  runtime: RuntimeCapabilities,
): CapabilityCheck {
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

export class MissingCapabilitiesError extends Error {
  constructor(readonly check: CapabilityCheck) {
    super(
      `Runtime is missing required capabilities: ${check.missing.join(', ')}`,
    )
    this.name = 'MissingCapabilitiesError'
  }
}
