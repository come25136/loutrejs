import { buildApplicationModel, module, inject } from '@loutrejs/loutre'

describe('Module re-export', () => {
  it('importしたexportを明示的にre-exportできる', () => {
    class Repository {}
    class Service {
      constructor(readonly repository = inject(Repository)) {}
    }
    const repositoryModule = module(() => ({
      name: 'RepositoryModule',
      providers: [Repository],
      exports: [Repository],
    }))()
    const domainModule = module(() => ({
      name: 'DomainModule',
      imports: [repositoryModule],
      exports: [Repository],
    }))()
    const applicationModule = module(() => ({
      name: 'ApplicationModule',
      imports: [domainModule],
      providers: [Service],
    }))()

    expect(
      buildApplicationModel({ modules: [applicationModule] }).diagnostics,
    ).toEqual([])
  })

  it('宣言もimportもしていないtokenのexportを拒否する', () => {
    class Repository {}
    const invalidModule = module(() => ({
      name: 'InvalidModule',
      exports: [Repository],
    }))()

    expect(
      buildApplicationModel({ modules: [invalidModule] }).diagnostics,
    ).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_MODULE_EXPORT_UNRESOLVED' }),
    )
  })
})
