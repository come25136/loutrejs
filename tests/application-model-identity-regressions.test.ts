import { describe, expect, it, vi } from 'vitest'
import {
  bindRuntimeCapability,
  buildApplicationModel,
  defineExecution,
  defineExecutionExtension,
  defineModule,
  RuntimeCapabilityRegistry,
  runtimeCapability,
  type ExecutionDefinition,
} from '@loutrejs/loutre'

interface FixtureDefinition extends ExecutionDefinition {
  readonly id: string
}

function fixtureExtension(name: string, marker: string) {
  const compile = vi.fn((definition: FixtureDefinition) => ({
    kind: 'execution' as const,
    id: definition.id,
    executionKind: 'fixture.execution',
    dependencies: [],
    capabilities: [],
    compiled: { marker },
  }))
  const validate = vi.fn(() => [])
  const createRuntime = vi.fn(() => ({}))
  const extension = defineExecutionExtension<
    FixtureDefinition,
    { readonly marker: string }
  >({
    kind: 'execution-extension',
    name,
    compile,
    validate,
    createRuntime,
  })
  return { extension, compile, validate, createRuntime }
}

describe('Application Model identity regressions', () => {
  it('同名だが別descriptorのExtensionを同じownerへmergeしない', () => {
    const first = fixtureExtension('@fixture/collision', 'first')
    const second = fixtureExtension('@fixture/collision', 'second')
    const Module = defineModule(() => ({
      executions: [
        defineExecution(first.extension, { id: 'fixture.first' }),
        defineExecution(second.extension, { id: 'fixture.second' }),
      ],
    }))

    const model = buildApplicationModel({ modules: [Module()] })

    expect(model.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_EXTENSION_NAME_COLLISION' }),
    )
    expect(model.executions.map((execution) => execution.id)).toEqual([
      'fixture.first',
    ])
    expect(first.compile).toHaveBeenCalledTimes(1)
    expect(first.validate).toHaveBeenCalledTimes(1)
    expect(second.compile).not.toHaveBeenCalled()
    expect(second.validate).not.toHaveBeenCalled()
  })

  it('stable Extension identityはbundle境界lookupにだけ利用する', () => {
    const bundled = fixtureExtension('@fixture/bundle-safe', 'bundled')
    const host = fixtureExtension('@fixture/bundle-safe', 'host')
    const Module = defineModule(() => ({
      executions: [
        defineExecution(bundled.extension, { id: 'fixture.bundled' }),
      ],
    }))

    const model = buildApplicationModel({ modules: [Module()] })
    const group = model.extensions.get(host.extension)

    expect(bundled.extension).not.toBe(host.extension)
    expect(bundled.extension.identity).toBe(host.extension.identity)
    expect(group?.executions[0]?.compiled.marker).toBe('bundled')
  })

  it('Runtime Capability idをbundle-safeな論理identityとして扱う', () => {
    const bundled = runtimeCapability<{ readonly runtime: string }>(
      'fixture.bundle-safe',
    )
    const host = runtimeCapability<{ readonly runtime: string }>(
      'fixture.bundle-safe',
    )
    const value = { runtime: 'test' }
    const registry = new RuntimeCapabilityRegistry([
      bindRuntimeCapability(host, value),
    ])

    expect(bundled).not.toBe(host)
    expect(registry.get(bundled)).toBe(value)
  })
})
