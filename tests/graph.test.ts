import {
  defineEnv,
  defineModule,
  hook,
  inject,
  provide,
  token,
} from '@loutrejs/core'
import { compileApplication } from '@loutrejs/graph'
import { z } from 'zod'

describe('Runtime Application Graph', () => {
  it('managed classのinject edgeとscopeをGraph Probeで取得する', () => {
    class Repository {}
    class Service {
      constructor(readonly repository = inject(Repository)) {}
    }
    const Module = defineModule(() => ({ providers: [Repository, Service] }))

    const { graph, diagnostics } = compileApplication({ modules: [Module()] })
    expect(diagnostics).toEqual([])
    const service = graph.nodes.find(({ label }) => label === 'Service')
    const repository = graph.nodes.find(({ label }) => label === 'Repository')
    expect(service).toEqual(expect.objectContaining({ scope: 'application' }))
    expect(graph.edges).toContainEqual({
      from: service?.id,
      to: repository?.id,
      kind: 'inject',
      source: 'probed',
    })
  })

  it('conditional全候補をprobeし未選択branchのbroken dependencyを診断する', () => {
    const MISSING = token<unknown>('graph.missing')
    const STORAGE = token<unknown>('graph.storage')
    class Env extends defineEnv(
      z.object({ DRIVER: z.enum(['memory', 'broken']) }),
    ) {}
    class MemoryStorage {}
    class BrokenStorage {
      constructor(readonly missing = inject(MISSING)) {}
    }
    const Module = defineModule(() => ({
      providers: [
        provide(Env).useValue(new Env({ DRIVER: 'memory' })),
        provide(STORAGE).select(Env.key('DRIVER'), {
          memory: MemoryStorage,
          broken: BrokenStorage,
        }),
      ],
    }))

    const { graph, diagnostics } = compileApplication({ modules: [Module()] })
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'conditional',
          condition: { key: 'DRIVER', equals: 'memory' },
        }),
        expect.objectContaining({
          kind: 'conditional',
          condition: { key: 'DRIVER', equals: 'broken' },
        }),
        expect.objectContaining({ kind: 'inject', source: 'probed' }),
      ]),
    )
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'LUTRE_DI_UNRESOLVED',
        path: 'BrokenStorage',
      }),
    )
  })

  it('Probeではlifecycleを実行せずdeclared edgeだけを記録する', () => {
    const VALUE = token<string>('graph.lifecycle.value')
    let executions = 0
    const Module = defineModule(() => ({
      providers: [provide(VALUE).useValue('value')],
      lifecycle: {
        onModuleInit: hook({
          inject: [VALUE],
          run: () => {
            executions += 1
          },
        }),
      },
    }))

    const { graph } = compileApplication({ modules: [Module()] })
    expect(executions).toBe(0)
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        kind: 'lifecycle',
        source: 'declared',
      }),
    )
  })

  it('factory dependencyとDI cycleをfirst-class edge/diagnosticで表す', () => {
    const A_TOKEN = token<unknown>('graph.cycle.a')
    const B_TOKEN = token<unknown>('graph.cycle.b')
    const FACTORY = token<unknown>('graph.factory')
    class A {
      constructor(readonly b = inject(B_TOKEN)) {}
    }
    class B {
      constructor(readonly a = inject(A_TOKEN)) {}
    }
    const Module = defineModule(() => ({
      providers: [
        provide(A_TOKEN).useClass(A),
        provide(B_TOKEN).useClass(B),
        provide(FACTORY).useFactory({
          inject: [A_TOKEN],
          use: (value) => value,
        }),
      ],
    }))

    const { graph, diagnostics } = compileApplication({ modules: [Module()] })
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        kind: 'factory',
        source: 'declared',
      }),
    )
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_DI_CYCLE' }),
    )
  })

  it('未解決のdeclared dependencyとasync factoryをGraph validationで拒否する', () => {
    const MISSING = token<unknown>('graph.factory.missing')
    const VALUE = token<unknown>('graph.factory.async')
    const Module = defineModule(() => ({
      providers: [
        provide(VALUE).useFactory({
          inject: [MISSING],
          use: (async () => ({})) as never,
        }),
      ],
    }))

    const { diagnostics } = compileApplication({ modules: [Module()] })
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'LUTRE_DI_UNRESOLVED' }),
        expect.objectContaining({ code: 'LUTRE_DI_ASYNC_FACTORY' }),
      ]),
    )
  })
})
