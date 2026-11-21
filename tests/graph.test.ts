import {
  bootstrapApplication,
  buildApplicationModel,
  application,
  env,
  module,
  hook,
  inject,
  provide,
  token,
} from '@loutrejs/loutre'
import { z } from 'zod'

describe('Application Model graph', () => {
  it('managed classのinject edgeとscopeをModelに保持する', () => {
    class Repository {}
    class Service {
      constructor(readonly repository = inject(Repository)) {}
    }
    const Module = module(() => ({ providers: [Repository, Service] }))
    const model = buildApplicationModel({ modules: [Module()] })
    const service = model.nodes.find(
      (node) => node.kind === 'provider' && node.token === Service,
    )
    const repository = model.nodes.find(
      (node) => node.kind === 'provider' && node.token === Repository,
    )

    expect(service).toMatchObject({ provider: { scope: 'application' } })
    expect(model.edges).toContainEqual({
      from: service?.id,
      to: repository?.id,
      kind: 'injects',
    })
  })

  it('conditional全候補のdependencyを収集し未解決を診断する', () => {
    const MISSING = token<unknown>('graph.missing')
    const STORAGE = token<unknown>('graph.storage')
    class Env extends env(z.object({ DRIVER: z.enum(['memory', 'broken']) })) {}
    class MemoryStorage {}
    class BrokenStorage {
      constructor(readonly missing = inject(MISSING)) {}
    }
    const Module = module(() => ({
      environment: [Env],
      providers: [
        provide(STORAGE).select(Env.key('DRIVER'), {
          memory: MemoryStorage,
          broken: BrokenStorage,
        }),
      ],
    }))
    const model = buildApplicationModel({ modules: [Module()] })
    const storage = model.nodes.find(
      (node) => node.kind === 'provider' && node.token === STORAGE,
    )

    expect(storage).toMatchObject({ dependencies: [Env, MISSING] })
    expect(model.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_PROVIDER_DEPENDENCY_MISSING' }),
    )
  })

  it('Model構築ではlifecycleを実行せずdeclared dependency edgeだけを記録する', () => {
    const VALUE = token<string>('graph.lifecycle.value')
    let executions = 0
    const Module = module(() => ({
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
    const model = buildApplicationModel({ modules: [Module()] })

    expect(executions).toBe(0)
    expect(model.edges).toContainEqual(
      expect.objectContaining({ kind: 'injects' }),
    )
  })

  it('DI cycleとasync factoryはKernel初期化で拒否する', async () => {
    const A_TOKEN = token<unknown>('graph.cycle.a')
    const B_TOKEN = token<unknown>('graph.cycle.b')
    const ASYNC = token<unknown>('graph.factory.async')
    class A {
      constructor(readonly b = inject(B_TOKEN)) {}
    }
    class B {
      constructor(readonly a = inject(A_TOKEN)) {}
    }
    const CycleModule = module(() => ({
      providers: [provide(A_TOKEN).useClass(A), provide(B_TOKEN).useClass(B)],
    }))
    await expect(
      bootstrapApplication({
        application: application({ modules: [CycleModule()] }),
      }),
    ).rejects.toThrow('LUTRE_DI_CYCLE')

    const AsyncModule = module(() => ({
      providers: [
        provide(ASYNC).useFactory({ use: async (): Promise<unknown> => ({}) }),
      ],
    }))
    await expect(
      bootstrapApplication({
        application: application({ modules: [AsyncModule()] }),
      }),
    ).rejects.toThrow('LUTRE_DI_ASYNC_FACTORY')
  })
})
