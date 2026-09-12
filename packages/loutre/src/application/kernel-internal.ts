import {
  bindRuntimeCapability,
  type ApplicationModel,
  type RuntimeCapability,
  type RuntimeCapabilityBinding,
} from '../core/index.js'

export function bindApplicationCapability<TValue>(
  model: ApplicationModel,
  id: string,
  value: TValue,
): RuntimeCapabilityBinding<TValue> {
  const capability = model.executions
    .flatMap((execution) => execution.capabilities)
    .find((candidate) => candidate.id === id)
  if (!capability) {
    throw new Error(`LUTRE_CAPABILITY_NOT_REQUIRED: ${id}`)
  }
  return bindRuntimeCapability(capability as RuntimeCapability<TValue>, value)
}
