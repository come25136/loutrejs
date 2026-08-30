import { defineModule, inject } from '@loutrejs/loutre'
import { compileApplication } from '@loutrejs/loutre/graph'

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

    const { graph, diagnostics } = compileApplication({
      modules: [serviceModule],
    })

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'LUTRE_MODULE_VISIBILITY',
        path: expect.stringContaining('class:Service'),
      }),
    )
    expect(graph.nodes.find(({ label }) => label === 'Repository')).toEqual(
      expect.objectContaining({ visibility: 'private' }),
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

    const { graph, diagnostics } = compileApplication({
      modules: [serviceModule],
    })

    expect(diagnostics).toEqual([])
    expect(graph.nodes.find(({ label }) => label === 'Repository')).toEqual(
      expect.objectContaining({ visibility: 'exported' }),
    )
  })

  it('exportされていてもModuleをimportしなければ依存できない', () => {
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
      providers: [Service],
    }))()

    const { diagnostics } = compileApplication({
      modules: [repositoryModule, serviceModule],
    })

    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_MODULE_VISIBILITY' }),
    )
  })
})
