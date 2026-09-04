import {
  contract,
  type,
  implementation,
  defineModule,
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

const unauthorized = () => ({
  response: 'unauthorized' as const,
  body: { error: '認証が必要です' },
})

function createAuthentication(
  authenticate: (
    token: string,
  ) => { currentUser: { readonly id: string } } | undefined,
) {
  return bearerAuth({
    realm: 'Loutre Test',
    state: type<{ currentUser: { readonly id: string } }>(),
    factory: () => ({
      authenticate,
      unauthorized,
    }),
  })
}

describe('bearerAuth', () => {
  it('tokenを認証してstate contributionを後段へ渡す', async () => {
    const authenticate = vi.fn(() => ({ currentUser: { id: 'user-1' } }))
    const authentication = createAuthentication(authenticate)

    const execution = await runBearerAuth(authentication, {
      input: { headers: { authorization: 'Bearer loutre-token' } },
    })

    expect(execution.provided).toEqual({ currentUser: { id: 'user-1' } })
    expect(authenticate).toHaveBeenCalledWith('loutre-token')
    expect(authentication.kind).toBe('layer')
    expect(authentication.requires).toEqual([])
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
      state: type<{ currentUser: { readonly id: string } }>(),
      factory: (service = inject(TOKEN_SERVICE)) => ({
        authenticate(value) {
          injectedService = service
          const currentUser = service.authenticate(value)
          return currentUser === undefined ? undefined : { currentUser }
        },
        unauthorized,
      }),
    })

    const container = new Container([
      provide(TOKEN_SERVICE).useValue(tokenService),
    ])
    container.preparePipeline([authentication])
    const runtime = container.layerRuntime(authentication as never)
    let provided: { currentUser: { readonly id: string } } | undefined

    await runtime(
      {
        input: { headers: { authorization: 'Bearer loutre-token' } },
        state: {},
      },
      async (value) => {
        provided = value as { currentUser: { readonly id: string } }
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
    const authenticate = vi.fn(() => ({ currentUser: { id: 'user-1' } }))
    const { result } = await runBearerAuth(createAuthentication(authenticate), {
      input: {
        headers: authorization == null ? {} : { authorization },
      },
    })

    expect(isShortCircuit(result)).toBe(true)
    expect(result).toMatchObject({
      result: {
        kind: 'http-result',
        response: 'unauthorized',
        body: { error: '認証が必要です' },
        headers: {
          'www-authenticate': 'Bearer realm="Loutre Test"',
        },
      },
    })
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('authenticateが認証結果を返さなければ401へshort circuitする', async () => {
    const { result } = await runBearerAuth(
      createAuthentication(() => undefined),
      {
        input: { headers: { authorization: 'Bearer wrong-token' } },
      },
    )

    expect(isShortCircuit(result)).toBe(true)
  })

  it('realmをquoted-stringとしてescapeする', async () => {
    const authentication = bearerAuth({
      realm: 'Loutre "API" \\ Area',
      state: type<{}>(),
      factory: () => ({
        authenticate: () => undefined,
        unauthorized,
      }),
    })

    const { result } = await runBearerAuth(authentication, {
      input: { headers: {} },
    })

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
        state: type<{}>(),
        factory: () => ({
          authenticate: () => undefined,
          unauthorized,
        }),
      })

    expect(() => create('')).toThrow(TypeError)
    expect(() => create('Loutre\nAPI')).toThrow(TypeError)
  })

  it.each([
    { status: undefined, code: 'LUTRE_SHORT_CIRCUIT_001' },
    { status: 403, code: 'LUTRE_SHORT_CIRCUIT_002' },
  ])('unauthorized responseの不整合を$codeで診断する', ({ status, code }) => {
    const authentication = createAuthentication(() => undefined)
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
  TContribution extends object,
  TResponse extends string,
  TBody,
>(
  authentication: BearerAuthLayerDescriptor<TContribution, TResponse, TBody>,
  context: BearerAuthContext,
) {
  let provided: TContribution | undefined
  const result = await authentication.factory()(
    { ...context, state: {} },
    (async (value: TContribution) => {
      provided = value
    }) as import('@loutrejs/loutre').LayerNext<TContribution>,
  )
  return { result, provided }
}
