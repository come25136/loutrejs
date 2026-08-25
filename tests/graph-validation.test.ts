import {
  contract,
  contextKey,
  defineModule,
  implement,
  inject,
  layer,
  type PipelineItem,
  provide,
  procedure,
  token,
} from '@loutrejs/core'
import { compileApplication } from '@loutrejs/graph'
import {
  DatabaseService,
  transaction,
  type DatabaseAdapterSpec,
} from '@loutrejs/database'
import { http } from '@loutrejs/http'
import { messagePort } from '@loutrejs/message-port'
import { z } from 'zod'

const Body = z.object({ ok: z.boolean() })

interface GraphDatabaseSpec extends DatabaseAdapterSpec {
  readonly client: { readonly kind: 'root' }
  readonly transactionClient: { readonly kind: 'transaction' }
  readonly beginOptions: { readonly secret?: string }
  readonly savepointOptions: never
  readonly capabilities: {
    readonly transactions: true
    readonly savepoints: true
  }
}

class GraphDatabase extends DatabaseService<GraphDatabaseSpec> {
  protected readonly transactionCapabilities = {
    transactions: true,
    savepoints: true,
  } as const
  protected connect() { return { kind: 'root' } as const }
  protected disconnect() {}
}

function protocol(pipeline: readonly PipelineItem[]) {
  return http(
    {
      method: 'GET',
      path: '/fixture',
      responses: { ok: { status: 200, body: Body } },
      pipeline,
    } as never,
  )
}

describe('Application Graph IRとsemantic validation', () => {
  it('recursive LayerIR v2と安全なtransaction属性を生成する', () => {
    const DATABASE = token<GraphDatabase>('database.graph')
    const nested = transaction({
      database: DATABASE,
      propagation: 'savepoint',
      options: {
        begin: { secret: 'graphへ出してはいけない' },
      },
      pipeline: [layer({ name: 'inside' })],
    })
    const outer = transaction({
      database: DATABASE,
      pipeline: [layer({ name: 'authorization' }), nested, http.controller],
    })
    const Contract = contract({
      run: procedure({ protocols: { http: protocol([outer]) } }),
    }, { name: 'RecursiveGraphContract' })
    class Controller { run() {} }
    const Module = defineModule(() => ({
      providers: [provide(DATABASE).useClass(GraphDatabase)],
      implementations: [implement(Contract).for(http).with(Controller as any)],
    }))

    const { graph, diagnostics } = compileApplication([Module()])
    expect(diagnostics).toEqual([])
    expect(graph.version).toBe(2)
    const root = graph.pipelines[0]?.layers[0]
    expect(root).toMatchObject({
      index: 0,
      name: 'database.transaction',
      dependencies: ['database.graph'],
      attributes: {
        propagation: 'required',
        beginOptions: 'default',
        savepointOptions: 'n/a',
      },
    })
    expect(root?.pipeline?.[1]).toMatchObject({
      index: 1,
      name: 'database.transaction',
      attributes: {
        propagation: 'savepoint',
        beginOptions: 'configured',
        savepointOptions: 'default',
      },
    })
    expect(root?.pipeline?.[1]?.pipeline?.[0]?.index).toBe(0)
    expect(JSON.stringify(graph)).not.toContain('graphへ出してはいけない')
    expect(graph.edges).toContainEqual(expect.objectContaining({
      from: 'layer:RecursiveGraphContract:run:http:0.1',
      to: 'token:database.graph',
      kind: 'inject',
      source: 'declared',
    }))
  })

  it('recursive terminal ruleとprotocol一致を検証する', () => {
    const composite = layer.compose({
      name: 'terminal-owner',
      pipeline: [http.controller],
      scope: () => ({ run: async (execute) => { await execute() } }),
    })
    const Contract = contract({
      run: procedure({
        protocols: {
          http: protocol([composite, layer({ name: 'too-late' })]),
        },
      }),
    })
    class Controller { run() {} }
    const Module = defineModule(() => ({
      implementations: [implement(Contract).for(http).with(Controller as any)],
    }))
    expect(compileApplication([Module()]).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_PIPELINE_002' }),
    )

    const mismatch = layer.compose({
      name: 'mismatch',
      pipeline: [messagePort.handler],
      scope: () => ({ run: async (execute) => { await execute() } }),
    })
    const MismatchContract = contract({
      run: procedure({ protocols: { http: protocol([mismatch]) } }),
    })
    const MismatchModule = defineModule(() => ({
      implementations: [implement(MismatchContract).for(http).with(Controller as any)],
    }))
    expect(compileApplication([MismatchModule()]).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_PIPELINE_003' }),
    )
  })

  it('Composite dependencyが要求するapplication scopeを検証する', () => {
    const DATABASE = token<GraphDatabase>('database.transient')
    const Contract = contract({
      run: procedure({
        protocols: {
          http: protocol([
            transaction({
              database: DATABASE,
              pipeline: [http.controller],
            }),
          ]),
        },
      }),
    })
    class Controller { run() {} }
    const Module = defineModule(() => ({
      providers: [
        provide(DATABASE).useClass(GraphDatabase, { scope: 'transient' }),
      ],
      implementations: [implement(Contract).for(http).with(Controller as any)],
    }))
    expect(compileApplication([Module()]).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_PIPELINE_DEPENDENCY_SCOPE' }),
    )
  })

  it('Graph ProbeでComposite scopeとchild pipelineを実行しない', () => {
    let scopeCalls = 0
    let childCalls = 0
    const composite = layer.compose({
      name: 'probe-safe',
      pipeline: [layer({
        name: 'child',
        inbound: () => { childCalls += 1 },
      }), http.controller],
      scope: () => {
        scopeCalls += 1
        return { run: async (execute) => { await execute() } }
      },
    })
    const Contract = contract({
      run: procedure({ protocols: { http: protocol([composite]) } }),
    })
    class Controller { run() {} }
    const Module = defineModule(() => ({
      implementations: [implement(Contract).for(http).with(Controller as any)],
    }))

    expect(compileApplication([Module()]).diagnostics).toEqual([])
    expect(scopeCalls).toBe(0)
    expect(childCalls).toBe(0)
  })

  it('recursive PipelineのContextとvalidation stateを順序どおり検証する', () => {
    const SESSION = contextKey('recursive.session').of<string>()
    const provider = layer({
      name: 'recursive-provider',
      provides: [SESSION],
      inbound: () => ({ 'recursive.session': 'ready' }),
    })
    const composite = layer.compose({
      name: 'recursive-state',
      pipeline: [provider, {
        kind: 'validation',
        name: 'validate.body',
        role: 'validation',
        part: 'body',
      }],
      scope: () => ({ run: async (execute) => { await execute() } }),
    })
    const consumer = layer({
      name: 'recursive-consumer',
      requires: [SESSION],
      requiresValidated: ['body'],
    })
    const Contract = contract({
      run: procedure({
        protocols: { http: protocol([composite, consumer, http.controller]) },
      }),
    })
    class Controller { run() {} }
    const Module = defineModule(() => ({
      implementations: [implement(Contract).for(http).with(Controller as any)],
    }))

    expect(compileApplication([Module()]).diagnostics).toEqual([])
  })

  it('recursive Pipeline全体のterminal exactly oneを検証する', () => {
    const first = layer.compose({
      name: 'first-terminal',
      pipeline: [http.controller],
      scope: () => ({ run: async (execute) => { await execute() } }),
    })
    const second = layer.compose({
      name: 'second-terminal',
      pipeline: [http.controller],
      scope: () => ({ run: async (execute) => { await execute() } }),
    })
    const Contract = contract({
      run: procedure({ protocols: { http: protocol([first, second]) } }),
    })
    class Controller { run() {} }
    const Module = defineModule(() => ({
      implementations: [implement(Contract).for(http).with(Controller as any)],
    }))

    expect(compileApplication([Module()]).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_PIPELINE_001' }),
    )
  })

  it('Composite childのshortCircuit declarationをresponseと照合する', () => {
    const child = layer({
      name: 'recursive-short-circuit',
      shortCircuits: [{
        protocol: 'http',
        variant: 'missing',
        response: { status: 409 },
      }],
    })
    const composite = layer.compose({
      name: 'short-circuit-owner',
      pipeline: [child],
      scope: () => ({ run: async (execute) => { await execute() } }),
    })
    const Contract = contract({
      run: procedure({
        protocols: { http: protocol([composite, http.controller]) },
      }),
    })
    class Controller { run() {} }
    const Module = defineModule(() => ({
      implementations: [implement(Contract).for(http).with(Controller as any)],
    }))

    expect(compileApplication([Module()]).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_SHORT_CIRCUIT_001' }),
    )
  })
  it('rejects a terminal that is not last', () => {
    const Contract = contract({
      run: procedure({
        protocols: {
          http: protocol([
            http.controller,
            layer({ name: 'too-late' }),
          ]),
        },
      }),
    })
    class Controller {
      run() {}
    }
    const Module = defineModule(() => ({
      implementations: [implement(Contract).for(http).with(Controller as any)],
    }))
    const result = compileApplication([Module()])

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_PIPELINE_002' }),
    )
  })

  it('Protocolと異なるterminalを拒否する', () => {
    const Contract = contract({
      run: procedure({
        protocols: {
          http: protocol([messagePort.handler]),
        },
      }),
    })
    class Controller {
      run() {}
    }
    const Module = defineModule(() => ({
      implementations: [
        implement(Contract).for(http).with(Controller as any),
      ],
    }))
    expect(
      compileApplication([Module()]).diagnostics.map(({ code }) => code),
    ).toContain('LUTRE_PIPELINE_003')
  })

  it('detects missing and duplicate implementation coverage', () => {
    const Contract = contract({
      get: procedure({ protocols: { http: protocol([http.controller]) } }),
      list: procedure({ protocols: { http: protocol([http.controller]) } }),
    })
    class First {
      get() {}
    }
    class Second {
      get() {}
    }
    const Module = defineModule(() => ({
      implementations: [
        implement(Contract).for(http).procedures('get').with(First as any),
        implement(Contract).for(http).procedures('get').with(Second as any),
      ],
    }))
    const codes = compileApplication([Module()]).diagnostics.map(
      (diagnostic) => diagnostic.code,
    )

    expect(codes).toContain('LUTRE_IMPL_001')
    expect(codes).toContain('LUTRE_IMPL_002')
  })

  it('Controller constructorにはapplication providerだけを許可する', () => {
    const SESSION = token<{ id: string }>('session')
    const SESSION_CONTEXT = contextKey('session').of<{ id: string }>()
    class Controller {
      constructor(readonly session = inject(SESSION)) {}
      run() {}
    }
    const Contract = contract({
      run: procedure({ protocols: { http: protocol([http.controller]) } }),
    })
    const InvalidModule = defineModule(() => ({
      implementations: [implement(Contract).for(http).with(Controller as any)],
    }))
    expect(
      compileApplication([InvalidModule()]).diagnostics.map(({ code }) => code),
    ).toContain('LUTRE_DI_UNRESOLVED')

    const sessionLayer = layer({
      name: 'session',
      role: 'guard',
      provides: [SESSION_CONTEXT],
      inbound: () => ({ session: { id: 'one' } }),
    })
    const LayerOnlyContract = contract({
      run: procedure({
        protocols: { http: protocol([sessionLayer, http.controller]) },
      }),
    })
    const LayerOnlyModule = defineModule(() => ({
      implementations: [
        implement(LayerOnlyContract).for(http).with(Controller as any),
      ],
    }))
    expect(
      compileApplication([LayerOnlyModule()]).diagnostics.map(({ code }) => code),
    ).toContain('LUTRE_DI_UNRESOLVED')

    const ValidModule = defineModule(() => ({
      providers: [provide(SESSION).useValue({ id: 'application' })],
      implementations: [implement(Contract).for(http).with(Controller as any)],
    }))
    expect(compileApplication([ValidModule()]).diagnostics).toEqual([])
  })

  it('emits the five initial graph dimensions without runtime-specific core APIs', () => {
    class Controller {
      run() {}
    }
    const Contract = contract({
      run: procedure({ protocols: { http: protocol([http.controller]) } }),
    })
    const Module = defineModule(() => ({
      name: 'GraphFixtureModule',
      description: 'graph fixture',
      implementations: [implement(Contract).for(http).with(Controller as any)],
    }))
    const { graph } = compileApplication([Module()])

    expect(graph.modules).toHaveLength(1)
    expect(graph.modules[0]?.name).toBe('GraphFixtureModule')
    expect(graph.providers).toEqual([])
    expect(graph.contracts).toHaveLength(1)
    expect(graph.pipelines[0]?.layers[0]?.role).toBe('terminal')
    expect(graph.capabilities.map(({ name }) => name)).toContain('http.server')
    expect(graph.capabilities.map(({ name }) => name)).toContain('crypto.random')
  })

  it('異なるtoken declarationの重複IDを拒否する', () => {
    const FIRST = token<string>('duplicate-token')
    const SECOND = token<string>('duplicate-token')
    const Module = defineModule(() => ({
      providers: [
        provide(FIRST).useValue('first'),
        provide(SECOND).useValue('second'),
      ],
    }))

    const result = compileApplication([Module()])
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_TOKEN_001' }),
    )
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'LUTRE_DI_003' }),
    )
  })

  it('同じModule内のduplicate Providerを静的に拒否する', () => {
    const VALUE = token<string>('duplicate-provider.direct')
    const Module = defineModule(() => ({
      providers: [
        provide(VALUE).useValue('first'),
        provide(VALUE).useValue('second'),
      ],
    }))

    expect(compileApplication([Module()]).diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'LUTRE_DI_003',
        message: expect.stringContaining('duplicate-provider.direct'),
      }),
    )
  })

  it('importされたModule間のduplicate Providerを静的に拒否する', () => {
    const VALUE = token<string>('duplicate-provider.imported')
    const FirstModule = defineModule(() => ({
      description: 'FirstModule',
      providers: [provide(VALUE).useValue('first')],
    }))
    const SecondModule = defineModule(() => ({
      description: 'SecondModule',
      providers: [provide(VALUE).useValue('second')],
    }))
    const RootModule = defineModule(() => ({
      imports: [FirstModule(), SecondModule()],
    }))

    expect(compileApplication([RootModule()]).diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'LUTRE_DI_003',
        message: expect.stringMatching(/FirstModule.*SecondModule/u),
      }),
    )
  })

  it('未提供のContext Key requirementを拒否する', () => {
    const SESSION = contextKey('session').of<{ id: string }>()
    const guarded = layer({
      name: 'guarded',
      requires: [SESSION],
      inbound: () => undefined,
    })
    const Contract = contract({
      run: procedure({
        protocols: { http: protocol([guarded, http.controller]) },
      }),
    })
    class Controller {
      run() {}
    }
    const Module = defineModule(() => ({
      implementations: [implement(Contract).for(http).with(Controller as any)],
    }))

    expect(compileApplication([Module()]).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_PIPELINE_004' }),
    )
  })

  it('同名の異なるContext Key宣言を拒否する', () => {
    const FIRST = contextKey('session').of<string>()
    const SECOND = contextKey('session').of<string>()
    const firstLayer = layer({
      name: 'first',
      provides: [FIRST],
      inbound: () => ({ session: 'first' }),
    })
    const secondLayer = layer({
      name: 'second',
      requires: [SECOND],
      inbound: () => undefined,
    })
    const Contract = contract({
      run: procedure({
        protocols: {
          http: protocol([firstLayer, secondLayer, http.controller]),
        },
      }),
    })
    class Controller {
      run() {}
    }
    const Module = defineModule(() => ({
      implementations: [implement(Contract).for(http).with(Controller as any)],
    }))

    expect(compileApplication([Module()]).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_CONTEXT_002' }),
    )
  })
})
