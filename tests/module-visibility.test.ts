import { buildApplicationModel, defineModule, inject } from '@loutrejs/loutre'

describe('Module visibility', () => {
  it('import先Moduleのprivate Providerへ依存できない', () => {
    class Repository {}
    class Service {
      constructor(readonly repository = inject(Repository)) {}
    }
    const repositoryModule = defineModule(() => ({
      name: 'RepositoryModule',
      providers: [Repository],
    }))()
    const serviceModule = defineModule(() => ({
      name: 'ServiceModule',
      imports: [repositoryModule],
      providers: [Service],
    }))()

    const model = buildApplicationModel({ modules: [serviceModule] })
    expect(model.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_MODULE_VISIBILITY' }),
    )
  })

  it('明示importしたModuleのexported Providerへ依存できる', () => {
    class Repository {}
    class Service {
      constructor(readonly repository = inject(Repository)) {}
    }
    const repositoryModule = defineModule(() => ({
      name: 'RepositoryModule',
      providers: [Repository],
      exports: [Repository],
    }))()
    const serviceModule = defineModule(() => ({
      name: 'ServiceModule',
      imports: [repositoryModule],
      providers: [Service],
    }))()

    expect(
      buildApplicationModel({ modules: [serviceModule] }).diagnostics,
    ).toEqual([])
  })

  it('exportされていてもModuleをimportしなければ依存できない', () => {
    class Repository {}
    class Service {
      constructor(readonly repository = inject(Repository)) {}
    }
    const repositoryModule = defineModule(() => ({
      providers: [Repository],
      exports: [Repository],
    }))()
    const serviceModule = defineModule(() => ({ providers: [Service] }))()

    expect(
      buildApplicationModel({ modules: [repositoryModule, serviceModule] })
        .diagnostics,
    ).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_MODULE_VISIBILITY' }),
    )
  })
})
