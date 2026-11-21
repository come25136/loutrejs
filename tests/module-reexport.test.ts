import {
  buildApplicationModel,
  module as createModule,
  inject,
} from '@loutrejs/loutre'

describe('Module re-export', () => {
  it('importしたexportを明示的にre-exportできる', () => {
    class Repository {}
    class Service {
      constructor(readonly repository = inject(Repository)) {}
    }
    const repositoryModule = createModule(() => ({
      name: 'RepositoryModule',
      providers: [Repository],
      exports: [Repository],
    }))()
    const domainModule = createModule(() => ({
      name: 'DomainModule',
      imports: [repositoryModule],
      exports: [Repository],
    }))()
    const applicationModule = createModule(() => ({
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
    const module = createModule(() => ({
      name: 'InvalidModule',
      exports: [Repository],
    }))()

    expect(
      buildApplicationModel({ modules: [module] }).diagnostics,
    ).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_MODULE_EXPORT_UNRESOLVED' }),
    )
  })
})
