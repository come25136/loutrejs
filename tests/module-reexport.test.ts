import { defineModule, inject } from '@loutrejs/loutre'
import { compileApplication } from '@loutrejs/loutre/graph'

describe('Module re-export', () => {
  it('importしたexportを明示的にre-exportできる', () => {
    class Repository {}
    class Service {
      constructor(readonly repository = inject(Repository)) {}
    }
    const repositoryModule = defineModule(() => ({
      name: 'RepositoryModule',
      providers: [Repository],
      exports: [Repository],
    }))()
    const domainModule = defineModule(() => ({
      name: 'DomainModule',
      imports: [repositoryModule],
      exports: [Repository],
    }))()
    const applicationModule = defineModule(() => ({
      name: 'ApplicationModule',
      imports: [domainModule],
      providers: [Service],
    }))()

    const { diagnostics } = compileApplication({ modules: [applicationModule] })

    expect(diagnostics).toEqual([])
  })

  it('宣言もimportもしていないtokenのexportを拒否する', () => {
    class Repository {}
    const module = defineModule(() => ({
      name: 'InvalidModule',
      exports: [Repository],
    }))()

    const { diagnostics } = compileApplication({ modules: [module] })

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'LUTRE_MODULE_EXPORT_UNRESOLVED',
        path: 'module:1.exports.Repository',
      }),
    )
  })
})
