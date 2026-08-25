import {
  contract,
  defineModule,
  implementation,
  inject,
  procedure,
} from '@loutrejs/core'
import { compileApplication } from '@loutrejs/graph'
import { http } from '@loutrejs/http'
import { messagePort } from '@loutrejs/message-port'
import { ApplicationRuntime } from '@loutrejs/runtime'
import { z } from 'zod'

function createContract() {
  return contract(
    {
      get: procedure({
        protocols: {
          http: http({
            method: 'GET',
            path: '/implementation/{id}',
            responses: { ok: { status: 200, body: z.string() } },
            pipeline: [http.controller],
          }),
        },
      }),
      list: procedure({
        protocols: {
          http: http({
            method: 'GET',
            path: '/implementations',
            responses: { ok: { status: 200, body: z.string() } },
            pipeline: [http.controller],
          }),
        },
      }),
    },
    { name: 'ImplementationContract' },
  )
}

describe('Implementation descriptorとfactory runtime', () => {
  it('definition時にはfactoryを実行せずmetadataとprocedureを固定する', () => {
    const Contract = createContract()
    let calls = 0
    const selected: 'get'[] = ['get']
    const Implementation = implementation({
      name: 'GetImplementation',
      contract: Contract,
      protocol: http,
      procedures: selected,
      factory: () => {
        calls += 1
        return {
          get(ctx) {
            return ctx.response.ok({ body: ctx.params.id })
          },
        }
      },
    })
    selected.push('get')

    expect(calls).toBe(0)
    expect(Implementation).toMatchObject({
      kind: 'implementation',
      name: 'GetImplementation',
      protocol: 'http',
      procedures: ['get'],
    })
    expect(Object.isFrozen(Implementation)).toBe(true)
    expect(Object.isFrozen(Implementation.procedures)).toBe(true)
  })

  it('ApplicationRuntimeごとにfactory resultを1回だけ構築してcacheする', async () => {
    const Contract = createContract()
    let constructions = 0
    let lifecycleCalls = 0
    class Service {
      readonly value = 'service'
    }
    const Implementation = implementation({
      name: 'CachedImplementation',
      contract: Contract,
      protocol: http,
      factory: (service = inject(Service)) => {
        constructions += 1
        return {
          onModuleInit() {
            lifecycleCalls += 1
          },
          get(ctx) {
            return ctx.response.ok({ body: `${service.value}:${ctx.params.id}` })
          },
          list(ctx) {
            return ctx.response.ok({ body: service.value })
          },
        }
      },
    })
    const Module = defineModule(() => ({
      providers: [Service],
      implementations: [Implementation],
    }))

    const runtime = new ApplicationRuntime([Module()])
    expect(constructions).toBe(1)
    const first = runtime.container.implementationRuntime(Implementation)
    runtime.container.prepareImplementation(Implementation)
    const second = runtime.container.implementationRuntime(Implementation)
    expect(first).toBe(second)
    expect(constructions).toBe(1)

    await runtime.initialize()
    expect(lifecycleCalls).toBe(0)
  })

  it.each([
    {
      code: 'LUTRE_IMPL_ASYNC_FACTORY',
      factory: async () => ({ get() {}, list() {} }),
    },
    {
      code: 'LUTRE_IMPL_FACTORY_RESULT',
      factory: () => 1,
    },
    {
      code: 'LUTRE_IMPL_004',
      factory: () => ({ get() {} }),
    },
  ])('$codeをruntime constructionで拒否する', ({ code, factory }) => {
    const Contract = createContract()
    const Invalid = implementation({
      name: 'InvalidImplementation',
      contract: Contract,
      protocol: http,
      factory,
    } as never)
    const Module = defineModule(() => ({ implementations: [Invalid] }))

    expect(() => new ApplicationRuntime([Module()])).toThrow(code)
  })

  it('不正または重複したpartial procedureをdefinition時に拒否する', () => {
    const Contract = createContract()
    const declaration = (procedures: readonly string[]) => ({
      name: 'InvalidDefinition',
      contract: Contract,
      protocol: http,
      procedures,
      factory: () => ({ get() {} }),
    })

    expect(() => implementation(declaration(['missing']) as never)).toThrow(
      'LUTRE_IMPL_003',
    )
    expect(() => implementation(declaration(['get', 'get']) as never)).toThrow(
      'more than once',
    )
    expect(() =>
      implementation({
        ...declaration(['get']),
        protocol: messagePort,
      } as never),
    ).toThrow('does not declare any procedure')
  })

  it('Graph Probeでfactoryをdescriptorごとに1回実行しDI edgeを記録する', () => {
    const Contract = createContract()
    let probes = 0
    class Service {}
    const Implementation = implementation({
      name: 'GraphImplementation',
      contract: Contract,
      protocol: http,
      factory: (_service = inject(Service)) => {
        probes += 1
        return {
          get() {
            return { kind: 'http-result', variant: 'ok', body: 'get' } as const
          },
          list() {
            return { kind: 'http-result', variant: 'ok', body: 'list' } as const
          },
        }
      },
    })
    const Module = defineModule(() => ({
      providers: [Service],
      implementations: [Implementation],
    }))

    const { graph, diagnostics } = compileApplication([Module()])
    expect(diagnostics).toEqual([])
    expect(probes).toBe(1)
    const implementationNode = graph.nodes.find(
      ({ label }) => label === 'GraphImplementation',
    )
    const serviceNode = graph.nodes.find(({ label }) => label === 'Service')
    expect(implementationNode?.kind).toBe('implementation')
    expect(graph.edges).toContainEqual({
      from: implementationNode?.id,
      to: serviceNode?.id,
      kind: 'inject',
      source: 'probed',
    })
  })

  it('同名descriptorをobject identityが異なるImplementation nodeとして扱う', () => {
    const Contract = createContract()
    const Get = implementation({
      name: 'SameName',
      contract: Contract,
      protocol: http,
      procedures: ['get'],
      factory: () => ({ get: () => ({ kind: 'http-result' }) as never }),
    })
    const List = implementation({
      name: 'SameName',
      contract: Contract,
      protocol: http,
      procedures: ['list'],
      factory: () => ({ list: () => ({ kind: 'http-result' }) as never }),
    })
    const Module = defineModule(() => ({ implementations: [Get, List] }))

    const { graph, diagnostics } = compileApplication([Module()])
    expect(diagnostics).toEqual([])
    const nodes = graph.nodes.filter(
      ({ kind, label }) => kind === 'implementation' && label === 'SameName',
    )
    expect(nodes).toHaveLength(2)
    expect(nodes[0]?.id).not.toBe(nodes[1]?.id)
  })
})
