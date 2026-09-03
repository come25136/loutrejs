import {
  contextKey,
  contract,
  defineModule,
  implementation,
  inject,
  isShortCircuit,
  provide,
  token,
} from '@loutrejs/loutre'
import { compileApplication } from '@loutrejs/loutre/graph'
import {
  bearerAuth,
  http,
  type BearerAuthContext,
  type BearerAuthLayerDescriptor,
  type HttpProtocolDefinition,
} from '@loutrejs/loutre/http'
import { Container } from '@loutrejs/loutre/runtime'
import { z } from 'zod'

describe('bearerAuth', () => {
  const CURRENT_USER = contextKey<{
    currentUser: {
      readonly id: string
    }
  }>('currentUser')

  it('tokenを認証してContextへ追加する', async () => {
    const authenticate = vi.fn(() => ({ id: 'user-1' }))
    const authentication = bearerAuth({
      realm: 'Loutre Test',
      provide: CURRENT_USER,
      factory: () => authenticate,
      unauthorized: {
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
      },
    })

    const execution = await runBearerAuth(authentication, {
      headers: { authorization: 'Bearer loutre-token' },
    })

    expect(execution.provided).toEqual({ currentUser: { id: 'user-1' } })
    expect(authenticate).toHaveBeenCalledWith('loutre-token')
    expect(authentication.role).toBe('authentication')
    expect(authentication.provide).toBe(CURRENT_USER)
  })

  it('factoryでDI依存を解決できる', async () => {
    interface TokenService {
      authenticate(token: string): { readonly id: string } | undefined
    }

    const TOKEN_SERVICE = token<TokenService>('bearerAuth.tokenService')
    const tokenService: TokenService = {
      authenticate: vi.fn(() => ({ id: 'user-1' })),
    }
    let injectedService: TokenService | undefined

    const authentication = bearerAuth({
      realm: 'Loutre Test',
      provide: CURRENT_USER,
      factory: (service = inject(TOKEN_SERVICE)) => {
        injectedService = service
        return (value) => service.authenticate(value)
      },
      unauthorized: {
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
      },
    })

    const container = new Container([
      provide(TOKEN_SERVICE).useValue(tokenService),
    ])
    container.preparePipeline([authentication])
    const runtime = container.layerRuntime(
      authentication as never,
    ) as ReturnType<typeof authentication.factory>
    let provided:
      | import('@loutrejs/loutre').ContextProperties<
          readonly [typeof CURRENT_USER]
        >
      | undefined

    await runtime(
      { headers: { authorization: 'Bearer loutre-token' } },
      async (value) => {
        provided = value
      },
    )

    expect(injectedService).toBe(tokenService)
    expect(provided).toEqual({ currentUser: { id: 'user-1' } })
  })

  it.each([
    undefined,
    null,
    '',
    'Basic abc',
    'Bearer',
    'Bearer token with-spaces',
  ])('不正なAuthorization header %sを認証失敗にする', async (authorization) => {
    const authenticate = vi.fn(() => ({ id: 'user-1' }))
    const authentication = bearerAuth({
      realm: 'Loutre Test',
      provide: CURRENT_USER,
      factory: () => authenticate,
      unauthorized: {
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
      },
    })

    const { result } = await runBearerAuth(authentication, {
      headers: authorization == null ? {} : { authorization },
    })

    expect(isShortCircuit(result)).toBe(true)
    expect(result).toMatchObject({
      result: {
        kind: 'http-result',
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
        headers: {
          'www-authenticate': 'Bearer realm="Loutre Test"',
        },
      },
    })
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('factoryが認証結果を返さなければ401へshort circuitする', async () => {
    const authentication = bearerAuth({
      realm: 'Loutre Test',
      provide: CURRENT_USER,
      factory: () => () => undefined,
      unauthorized: {
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
      },
    })

    const { result } = await runBearerAuth(authentication, {
      headers: { authorization: 'Bearer wrong-token' },
    })

    expect(isShortCircuit(result)).toBe(true)
  })

  it('realmをquoted-stringとしてescapeする', async () => {
    const authentication = bearerAuth({
      realm: 'Loutre "API" \\ Area',
      provide: CURRENT_USER,
      factory: () => () => undefined,
      unauthorized: {
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
      },
    })

    const { result } = await runBearerAuth(authentication, { headers: {} })

    expect(result).toMatchObject({
      result: {
        headers: {
          'www-authenticate': 'Bearer realm="Loutre \\"API\\" \\\\ Area"',
        },
      },
    })
  })

  it('空または制御文字を含むrealmを拒否する', () => {
    const create = (realm: string) =>
      bearerAuth({
        realm,
        provide: CURRENT_USER,
        factory: () => () => undefined,
        unauthorized: {
          variant: 'unauthorized',
          body: { error: '認証が必要です' },
        },
      })

    expect(() => create('')).toThrow(TypeError)
    expect(() => create('Loutre\nAPI')).toThrow(TypeError)
  })

  it.each([
    { status: undefined, code: 'LUTRE_SHORT_CIRCUIT_001' },
    { status: 403, code: 'LUTRE_SHORT_CIRCUIT_002' },
  ])('unauthorized responseの不整合を$codeで診断する', ({ status, code }) => {
    const authentication = bearerAuth({
      realm: 'Loutre Test',
      provide: CURRENT_USER,
      factory: () => () => undefined,
      unauthorized: {
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
      },
    })
    const responses: HttpProtocolDefinition['responses'] =
      status === undefined
        ? {
            ok: { status: 200, body: z.object({ ok: z.boolean() }) },
          }
        : {
            unauthorized: {
              status,
              body: z.object({ error: z.string() }),
            },
          }
    const Contract = contract([
      http({
        get: {
          method: 'GET',
          path: '/bearer-auth-diagnostic',
          responses,
          pipeline: [authentication, http.controller],
        } as never,
      }),
    ])
    const Implementation = implementation({
      name: 'Implementation',
      contract: Contract,
      protocol: http,
      factory: () => ({
        get(): never {
          throw new Error('実行対象ではありません')
        },
      }),
    })
    const Module = defineModule(() => ({
      implementations: [Implementation],
    }))

    expect(
      compileApplication({ modules: [Module()] }).diagnostics,
    ).toContainEqual(expect.objectContaining({ code }))
  })
})

async function runBearerAuth<
  TProvided extends import('@loutrejs/loutre').ContextKey<any, any>,
  TVariant extends string,
  TBody,
>(
  authentication: BearerAuthLayerDescriptor<TProvided, TVariant, TBody>,
  context: BearerAuthContext,
) {
  let provided: import('@loutrejs/loutre').ContextShape<TProvided> | undefined
  const next = (async (
    value: import('@loutrejs/loutre').ContextShape<TProvided>,
  ) => {
    provided = value
  }) as unknown as import('@loutrejs/loutre').LayerNext<TProvided>
  const result = await authentication.factory()(context, next)
  return { result, provided }
}
