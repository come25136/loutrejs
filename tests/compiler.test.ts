import {
  Inject,
  contract,
  contextKey,
  defineModule,
  implement,
  layer,
  type PipelineItem,
  provide,
  procedure,
  token,
} from '@loutrejs/core'
import { compileApplication } from '@loutrejs/compiler'
import { http } from '@loutrejs/http'
import { messagePort } from '@loutrejs/message-port'
import { z } from 'zod'

const Body = z.object({ ok: z.boolean() })

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

describe('minimal Compiler IR and static validation', () => {
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
      constructor(@Inject(SESSION) readonly session: { id: string }) {}
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
    ).toContain('LUTRE_DI_001')

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
    ).toContain('LUTRE_DI_001')

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
      description: 'graph fixture',
      implementations: [implement(Contract).for(http).with(Controller as any)],
    }))
    const { graph } = compileApplication([Module()])

    expect(graph.modules).toHaveLength(1)
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
