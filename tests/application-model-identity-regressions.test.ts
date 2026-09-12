import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import * as runtimeApi from '@loutrejs/loutre/runtime'
import {
  bindRuntimeCapability,
  bootstrapApplication,
  buildApplicationModel,
  defineArgs,
  defineApplication,
  defineExecution,
  defineExecutionExtension,
  defineModule,
  hook,
  isExecutionDefinition,
  provide,
  token,
  RuntimeCapabilityRegistry,
  runtimeCapability,
  type ExecutionDefinition,
} from '@loutrejs/loutre'

interface FixtureDefinition extends ExecutionDefinition {
  readonly id: string
}

function fixtureExtension(name: string, marker: string, abiVersion = '1') {
  const compile = vi.fn((definition: FixtureDefinition) => ({
    kind: 'execution' as const,
    id: definition.id,
    executionKind: 'fixture.execution',
    dependencies: [],
    capabilities: [],
    compiled: Object.freeze({ marker }),
  }))
  const validate = vi.fn(() => [])
  const createRuntime = vi.fn(() => ({}))
  const extension = defineExecutionExtension<
    FixtureDefinition,
    { readonly marker: string }
  >({
    kind: 'execution-extension',
    name,
    abiVersion,
    compile,
    validate,
    createRuntime,
  })
  return { extension, compile, validate, createRuntime }
}

describe('Application Model identity regressions', () => {
  it('raw Moduleを再walkする旧Runtime Graph APIを公開しない', () => {
    const removedExports = [
      ['collect', 'Runtime', 'Module', 'Graph'].join(''),
      ['Runtime', 'Module', 'Graph'].join(''),
      ['Dependency', 'Recorder'].join(''),
    ]
    for (const name of removedExports) {
      expect(runtimeApi).not.toHaveProperty(name)
    }
    expect(runtimeApi.Container.prototype).not.toHaveProperty(
      ['probe', 'Class'].join(''),
    )
  })

  it('同じstable identityのExtension descriptorをbundle境界で同じownerへ統合する', () => {
    const first = fixtureExtension('@fixture/collision', 'compatible')
    const second = fixtureExtension('@fixture/collision', 'compatible')
    const Module = defineModule(() => ({
      executions: [
        defineExecution(first.extension, { id: 'fixture.first' }),
        defineExecution(second.extension, { id: 'fixture.second' }),
      ],
    }))

    const model = buildApplicationModel({ modules: [Module()] })

    expect(model.diagnostics).toEqual([])
    expect(model.executions.map((execution) => execution.id)).toEqual([
      'fixture.first',
      'fixture.second',
    ])
    expect(first.compile).toHaveBeenCalledTimes(1)
    expect(first.validate).toHaveBeenCalledTimes(1)
    expect(second.compile).toHaveBeenCalledTimes(1)
    expect(second.validate).not.toHaveBeenCalled()
  })

  it('異なるExtension ABI versionをModel build時に拒否する', async () => {
    const first = fixtureExtension('@fixture/abi-mismatch', 'v1', '1')
    const second = fixtureExtension('@fixture/abi-mismatch', 'v2', '2')
    const Module = defineModule(() => ({
      executions: [
        defineExecution(first.extension, { id: 'fixture.v1' }),
        defineExecution(second.extension, { id: 'fixture.v2' }),
      ],
    }))

    const model = buildApplicationModel({ modules: [Module()] })

    expect(model.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_EXTENSION_ABI_MISMATCH' }),
    )
    expect(first.extension.identity).not.toBe(second.extension.identity)
    await expect(
      bootstrapApplication({
        application: defineApplication({ modules: [Module()] }),
      }),
    ).rejects.toThrow('LUTRE_EXTENSION_ABI_MISMATCH')
  })

  it.each([
    {
      name: 'nested object',
      createCompiled: () => {
        const nested = { marker: 'before' }
        return {
          compiled: Object.freeze({ nested }),
          mutate: () => {
            nested.marker = 'after'
          },
          read: (compiled: unknown) =>
            (compiled as { nested: { marker: string } }).nested.marker,
        }
      },
    },
    {
      name: 'Object.freeze済みMap',
      createCompiled: () => {
        const compiled = Object.freeze(new Map([['marker', 'before']]))
        return {
          compiled,
          mutate: () => {
            compiled.set('marker', 'after')
          },
          read: (value: unknown) =>
            (value as ReadonlyMap<string, string>).get('marker'),
        }
      },
    },
    {
      name: 'function',
      createCompiled: () => {
        let marker = 'before'
        return {
          compiled: () => marker,
          mutate: () => {
            marker = 'after'
          },
          read: (compiled: unknown) => (compiled as () => string)(),
        }
      },
    },
  ])(
    'Coreはopaqueなcompiled（$name）をimmutability検査しない',
    ({ createCompiled }) => {
      const fixture = createCompiled()
      const extension = defineExecutionExtension<FixtureDefinition, unknown>({
        kind: 'execution-extension',
        name: '@fixture/opaque-compiled',
        abiVersion: '1',
        compile: (definition) => ({
          kind: 'execution',
          id: definition.id,
          executionKind: 'fixture.opaque-compiled',
          dependencies: [],
          capabilities: [],
          compiled: fixture.compiled,
        }),
        createRuntime: () => ({}),
      })
      const Module = defineModule(() => ({
        executions: [defineExecution(extension, { id: 'fixture.opaque' })],
      }))
      const model = buildApplicationModel({ modules: [Module()] })
      const compiled = model.extensions.get(extension)?.executions[0]?.compiled

      fixture.mutate()

      expect(model.diagnostics).toEqual([])
      expect(compiled).toBe(fixture.compiled)
      expect(fixture.read(compiled)).toBe('after')
    },
  )

  it('custom Extensionが元descriptorからimmutable compiled snapshotを構築する', () => {
    interface SnapshotDefinition extends ExecutionDefinition {
      readonly id: string
      readonly options: { readonly marker: string }
    }

    const extension = defineExecutionExtension<
      SnapshotDefinition,
      { readonly options: { readonly marker: string } }
    >({
      kind: 'execution-extension',
      name: '@fixture/compiled-snapshot',
      abiVersion: '1',
      compile: (definition) => ({
        kind: 'execution',
        id: definition.id,
        executionKind: 'fixture.compiled-snapshot',
        dependencies: [],
        capabilities: [],
        compiled: Object.freeze({
          options: Object.freeze({ ...definition.options }),
        }),
      }),
      createRuntime: () => ({}),
    })
    const options = { marker: 'before' }
    const execution = defineExecution(extension, {
      id: 'fixture.snapshot',
      options,
    })
    const Module = defineModule(() => ({ executions: [execution] }))
    const model = buildApplicationModel({ modules: [Module()] })
    const compiled = model.extensions.get(extension)?.executions[0]?.compiled

    options.marker = 'after'

    expect(model.diagnostics).toEqual([])
    expect(compiled).toEqual({
      options: { marker: 'before' },
    })
    expect(Object.isFrozen(compiled)).toBe(true)
    expect(Object.isFrozen(compiled?.options)).toBe(true)
  })

  it('stable Extension identityはbundle境界lookupにだけ利用する', () => {
    const bundled = fixtureExtension('@fixture/bundle-safe', 'compatible')
    const host = fixtureExtension('@fixture/bundle-safe', 'compatible')
    const Module = defineModule(() => ({
      executions: [
        defineExecution(bundled.extension, { id: 'fixture.bundled' }),
      ],
    }))

    const model = buildApplicationModel({ modules: [Module()] })
    const group = model.extensions.get(host.extension)

    expect(bundled.extension).not.toBe(host.extension)
    expect(bundled.extension.identity).toBe(host.extension.identity)
    expect(group?.executions[0]?.compiled.marker).toBe('compatible')
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

  it('Execution Definition brandをdual-copy相当のglobal symbolで認識する', () => {
    const fixture = fixtureExtension('@fixture/dual-copy-definition', 'copy')
    const definition = Object.freeze({
      kind: 'execution-definition' as const,
      extension: fixture.extension,
      id: 'fixture.dual-copy',
      [Symbol.for('loutre.execution-definition')]: true,
    })
    const Module = defineModule(() => ({
      executions: [definition as unknown as ExecutionDefinition],
    }))

    expect(isExecutionDefinition(definition)).toBe(true)
    expect(buildApplicationModel({ modules: [Module()] }).diagnostics).toEqual(
      [],
    )
  })

  it('同名の別Provider tokenへordinal node IDを割り当てる', () => {
    const First = class Duplicate {}
    const Second = class Duplicate {}
    const Module = defineModule(() => ({ providers: [First, Second] }))
    const model = buildApplicationModel({ modules: [Module()] })
    const providers = model.nodes.filter((node) => node.kind === 'provider')

    expect(providers.map((provider) => provider.id)).toEqual([
      'provider:1',
      'provider:2',
    ])
    expect(new Set(model.nodes.map((node) => node.id)).size).toBe(
      model.nodes.length,
    )
  })

  it('Execution ExtensionがCore node namespaceへ衝突するIDを返したら拒否する', () => {
    const fixture = fixtureExtension('@fixture/node-collision', 'collision')
    const Module = defineModule(() => ({
      executions: [
        defineExecution(fixture.extension, {
          id: 'module:1',
        }),
      ],
    }))

    expect(
      buildApplicationModel({ modules: [Module()] }).diagnostics,
    ).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_APPLICATION_NODE_ID_COLLISION' }),
    )
  })

  it.each(['close', '__proto__', 'constructor', 'prototype', 'serve', 'then'])(
    'Host namespace %sを予約語として拒否する',
    (namespace) => {
      const extension = defineExecutionExtension<any, {}, string, {}>({
        kind: 'execution-extension',
        abiVersion: '1',
        name: `@fixture/reserved-${namespace}`,
        compile: () => ({
          kind: 'execution',
          id: `fixture.reserved.${namespace}`,
          executionKind: 'fixture.reserved',
          dependencies: [],
          capabilities: [],
          compiled: Object.freeze({}),
        }),
        createRuntime: () => ({}),
        host: {
          namespace,
          create: () => ({}),
        },
      })
      const Module = defineModule(() => ({
        executions: [defineExecution(extension, {})],
      }))

      expect(
        buildApplicationModel({ modules: [Module()] }).diagnostics,
      ).toContainEqual(
        expect.objectContaining({ code: 'LUTRE_HOST_NAMESPACE_RESERVED' }),
      )
    },
  )

  it('Application Argumentsを通常Providerとして重複宣言したらModel build時に拒否する', async () => {
    const Args = defineArgs(z.object({ mode: z.string() }))
    const Module = defineModule(() => ({ providers: [Args] }))
    const definition = defineApplication({
      modules: [Module()],
      arguments: Args,
    })

    expect(definition.model.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_ARGS_001' }),
    )
    await expect(
      bootstrapApplication({
        application: definition,
        arguments: { mode: 'test' },
      }),
    ).rejects.toThrow('LUTRE_ARGS_001')
  })

  it('Provider・conditional mapping・Lifecycle metadataをModel build時点でsnapshotする', async () => {
    const CLOCK = token<number>('snapshot.clock')
    const MESSAGE = token<string>('snapshot.message')
    const SERVICE = token<object>('snapshot.service')
    const CLASS_SERVICE = token<object>('snapshot.class-service')
    const VALUE_SERVICE = token<object>('snapshot.value-service')
    const Args = defineArgs(z.object({ mode: z.enum(['first', 'second']) }))
    class FirstService {}
    class SecondService {}
    class MutatedService {}
    const originalValue = { source: 'model' }
    const classProvider = provide(CLASS_SERVICE).useClass(FirstService)
    const valueProvider = provide(VALUE_SERVICE).useValue(originalValue)
    const factoryInject = [CLOCK]
    const lifecycleInject = [MESSAGE]
    const factoryProvider = provide(MESSAGE).useFactory({
      inject: factoryInject,
      use: (clock) => `clock:${clock}`,
    })
    const mapping = { first: FirstService, second: SecondService }
    const conditionalProvider = provide(SERVICE).select(
      Args.key('mode'),
      mapping,
    )
    const lifecycle = hook({
      inject: lifecycleInject,
      run: (message) => {
        expect(message).toBe('clock:1')
      },
    })
    const Module = defineModule(() => ({
      providers: [
        provide(CLOCK).useValue(1),
        factoryProvider,
        conditionalProvider,
        classProvider,
        valueProvider,
      ],
      lifecycle: { onModuleInit: lifecycle },
    }))
    const definition = defineApplication({
      modules: [Module()],
      arguments: Args,
    })

    factoryInject.splice(0)
    lifecycleInject.splice(0)
    mapping.first = MutatedService
    ;(classProvider as { useClass: typeof MutatedService }).useClass =
      MutatedService
    ;(valueProvider as { useValue: object }).useValue = { source: 'mutated' }

    const application = await bootstrapApplication({
      application: definition,
      arguments: { mode: 'first' },
    })
    try {
      expect(application.get(MESSAGE)).toBe('clock:1')
      expect(application.get(SERVICE)).toBeInstanceOf(FirstService)
      expect(application.get(SERVICE)).not.toBeInstanceOf(MutatedService)
      expect(application.get(CLASS_SERVICE)).toBeInstanceOf(FirstService)
      expect(application.get(VALUE_SERVICE)).toBe(originalValue)
    } finally {
      await application.close()
    }
  })

  it('Model構築後にraw Module Definitionが変化してもRuntimeへ影響しない', async () => {
    const events: string[] = []
    class Resource {
      onModuleInit() {
        events.push('provider:model')
      }
    }
    const Module = defineModule(() => ({
      providers: [Resource],
      lifecycle: {
        onModuleInit: hook({
          inject: [],
          run: () => {
            events.push('hook:model')
          },
        }),
      },
    }))
    const module = Module()
    const definition = defineApplication({ modules: [module] })
    const mutable = module as unknown as {
      definition: {
        providers: readonly unknown[]
        lifecycle: { onModuleInit: ReturnType<typeof hook> }
      }
    }

    mutable.definition.providers = []
    mutable.definition.lifecycle = {
      onModuleInit: hook({
        inject: [],
        run: () => {
          events.push('hook:mutated')
        },
      }),
    }

    const application = await bootstrapApplication({ application: definition })
    try {
      expect(events).toEqual(['provider:model', 'hook:model'])
    } finally {
      await application.close()
    }
  })
})
