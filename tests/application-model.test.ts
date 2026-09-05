import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  ApplicationKernelRuntime,
  bindRuntimeCapability,
  bootstrapApplication,
  buildApplicationModel,
  defineApplication,
  defineExecution,
  defineExecutionExtension,
  defineModule,
  projectApplicationModel,
  runtimeCapability,
  type ExecutionDefinition,
  type ExecutionExtensionRuntimeContext,
  type ExecutionExtensionRuntime,
} from '@loutrejs/loutre'

interface ProbeDriver {
  invoke(name: string): Promise<string>
}

const PROBE_DRIVER = runtimeCapability<ProbeDriver>('probe.driver')

interface ProbeDefinition extends ExecutionDefinition {
  readonly id: string
  readonly dispatch: string
}

interface ProbeCompiled {
  readonly dispatch: string
}

interface ProbeRuntime extends ExecutionExtensionRuntime {
  invoke(id: string): Promise<string>
}

interface ProbeHostApi {
  invoke(id: string): Promise<string>
}

function createProbeExtension(events: string[] = []) {
  const compile = vi.fn(
    (
      definition: ProbeDefinition,
    ): {
      readonly kind: 'execution'
      readonly id: string
      readonly executionKind: string
      readonly extension: typeof definition.extension
      readonly dependencies: readonly []
      readonly capabilities: readonly [typeof PROBE_DRIVER]
      readonly compiled: ProbeCompiled
    } => ({
      kind: 'execution',
      id: definition.id,
      executionKind: 'probe.invoke',
      extension: definition.extension,
      dependencies: [],
      capabilities: [PROBE_DRIVER],
      compiled: { dispatch: definition.dispatch },
    }),
  )
  const createRuntime = vi.fn(
    ({
      executions,
      capabilities,
      applicationRuntime,
    }: ExecutionExtensionRuntimeContext<ProbeCompiled>) => {
      const driver = capabilities.get(PROBE_DRIVER)
      return {
        async invoke(id: string) {
          const execution = executions.find((candidate) => candidate.id === id)
          if (!execution) throw new Error(`Unknown probe execution: ${id}`)
          const lease = applicationRuntime.beginExecution()
          try {
            return await driver.invoke(execution.compiled.dispatch)
          } finally {
            lease.complete()
          }
        },
        drain() {
          events.push('extension.drain')
        },
        close() {
          events.push('extension.close')
        },
      } satisfies ProbeRuntime
    },
  )
  const extension = defineExecutionExtension<
    ProbeDefinition,
    ProbeCompiled,
    'probe',
    ProbeHostApi,
    ProbeRuntime
  >({
    kind: 'execution-extension',
    name: '@fixture/probe',
    compile,
    validate: ({ executions }) => {
      const seen = new Set<string>()
      return executions.flatMap((execution) => {
        if (!seen.has(execution.compiled.dispatch)) {
          seen.add(execution.compiled.dispatch)
          return []
        }
        return [
          {
            code: 'PROBE_DUPLICATE_DISPATCH',
            message: `Duplicate dispatch: ${execution.compiled.dispatch}`,
            path: execution.id,
          },
        ]
      })
    },
    createRuntime,
    project: ({ execution }) => ({ dispatch: execution.compiled.dispatch }),
    host: {
      namespace: 'probe',
      create: ({ runtime }) => ({
        invoke: (id) => runtime.invoke(id),
      }),
    },
  })
  return { extension, compile, createRuntime }
}

describe('Application Model', () => {
  it('compile済みcontributionをRuntimeとGraph projectionで共有する', async () => {
    const fixture = createProbeExtension()
    const execution = defineExecution(fixture.extension, {
      id: 'probe.hello',
      dispatch: 'hello',
    })
    const Module = defineModule(() => ({ executions: [execution] }))
    const definition = defineApplication({ modules: [Module()] })

    const firstGraph = projectApplicationModel(definition.model)
    const secondGraph = projectApplicationModel(definition.model)
    const application = await bootstrapApplication({
      application: definition,
      capabilities: [
        bindRuntimeCapability(PROBE_DRIVER, {
          invoke: async (name) => `pong:${name}`,
        }),
      ],
    })

    expect(firstGraph).toEqual(secondGraph)
    expect(fixture.compile).toHaveBeenCalledTimes(1)
    expect(fixture.createRuntime).toHaveBeenCalledTimes(1)
    expect(await application.probe.invoke('probe.hello')).toBe('pong:hello')
    expectTypeOf(application.probe).toEqualTypeOf<ProbeHostApi>()
    await application.close()
  })

  it('Extension単位のglobal validationをApplication diagnosticsへ統合する', () => {
    const fixture = createProbeExtension()
    const Module = defineModule(() => ({
      executions: [
        defineExecution(fixture.extension, {
          id: 'probe.first',
          dispatch: 'same',
        }),
        defineExecution(fixture.extension, {
          id: 'probe.second',
          dispatch: 'same',
        }),
      ],
    }))

    const model = buildApplicationModel({ modules: [Module()] })

    expect(model.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'PROBE_DUPLICATE_DISPATCH' }),
    )
  })

  it('不足CapabilityをExtension Runtime生成前に拒否する async', async () => {
    const fixture = createProbeExtension()
    const Module = defineModule(() => ({
      executions: [
        defineExecution(fixture.extension, {
          id: 'probe.hello',
          dispatch: 'hello',
        }),
      ],
    }))
    const runtime = new ApplicationKernelRuntime(
      buildApplicationModel({ modules: [Module()] }),
    )

    await expect(runtime.initialize()).rejects.toThrow(
      'LUTRE_CAPABILITY_MISSING',
    )
    expect(fixture.createRuntime).not.toHaveBeenCalled()
  })

  it('abort後もcompleteまでExecutionをactiveとして保持する', async () => {
    const runtime = new ApplicationKernelRuntime(
      buildApplicationModel({ modules: [] }),
    )
    await runtime.initialize()
    const lease = runtime.beginExecution()
    lease.abort('fixture')

    let closed = false
    const shutdown = runtime.shutdown().then(() => {
      closed = true
    })
    await Promise.resolve()

    expect(lease.signal.aborted).toBe(true)
    expect(closed).toBe(false)
    expect(() => runtime.beginExecution()).toThrow('LUTRE_APPLICATION_STATE')
    lease.complete()
    await shutdown
    expect(closed).toBe(true)
  })

  it('Extension close後にProviderをcleanupする', async () => {
    const events: string[] = []
    const fixture = createProbeExtension(events)
    class Resource {
      onModuleDestroy() {
        events.push('provider.destroy')
      }
    }
    const Module = defineModule(() => ({
      providers: [Resource],
      executions: [
        defineExecution(fixture.extension, {
          id: 'probe.hello',
          dispatch: 'hello',
        }),
      ],
    }))
    const runtime = new ApplicationKernelRuntime(
      buildApplicationModel({ modules: [Module()] }),
      {
        capabilities: [
          bindRuntimeCapability(PROBE_DRIVER, {
            invoke: async (name) => name,
          }),
        ],
      },
    )
    await runtime.initialize()

    await runtime.shutdown()

    expect(events).toEqual([
      'extension.drain',
      'extension.close',
      'provider.destroy',
    ])
  })
})
