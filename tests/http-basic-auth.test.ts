import {
  contextField,
  contract,
  defineModule,
  implementation,
  inject,
  isShortCircuit,
  layer,
  provide,
  token,
} from '@loutrejs/loutre'
import { compileApplication } from '@loutrejs/loutre/graph'
import {
  basicAuth,
  http,
  type BasicAuthContext,
  type BasicAuthCredentials,
  type BasicAuthLayerDescriptor,
  type HttpProtocolDefinition,
} from '@loutrejs/loutre/http'
import { Container } from '@loutrejs/loutre/runtime'
import { z } from 'zod'

describe('basicAuth', () => {
  const PRINCIPAL = contextField<{
    principal: {
      readonly id: string
    }
  }>()

  it('credentialsを認証してprincipalをContextへ追加する', async () => {
    const authenticate = vi.fn(() => ({ principal: { id: 'user-1' } }))
    const authentication = basicAuth({
      realm: 'Loutre Test',
      provide: PRINCIPAL,
      factory: () => authenticate,
      unauthorized: {
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
      },
    })

    const execution = await runBasicAuth(authentication, {
      headers: { authorization: `Basic ${btoa('loutre:otter')}` },
    })

    expect(execution.provided).toEqual({ principal: { id: 'user-1' } })
    expect(authenticate).toHaveBeenCalledWith({
      username: 'loutre',
      password: 'otter',
    })
    expect(authentication.role).toBe('authentication')
    expect(authentication.provide).toBe(PRINCIPAL)
    expect(authentication.requiresValidated).toEqual([])
  })

  it('factoryでDI依存を解決できる', async () => {
    interface UserService {
      authenticate(
        credentials: BasicAuthCredentials,
      ): { readonly id: string } | undefined
    }

    const USER_SERVICE = token<UserService>('basicAuth.userService')
    const userService: UserService = {
      authenticate: vi.fn(() => ({ id: 'user-1' })),
    }
    let injectedService: UserService | undefined

    const authentication = basicAuth({
      realm: 'Loutre Test',
      provide: PRINCIPAL,
      factory: (users = inject(USER_SERVICE)) => {
        injectedService = users
        return (credentials) => {
          const principal = users.authenticate(credentials)
          return principal === undefined ? undefined : { principal }
        }
      },
      unauthorized: {
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
      },
    })

    const container = new Container([
      provide(USER_SERVICE).useValue(userService),
    ])
    container.preparePipeline([authentication])
    const runtime = container.layerRuntime(
      authentication as never,
    ) as ReturnType<typeof authentication.factory>
    let provided:
      | import('@loutrejs/loutre').ContextProperties<
          readonly [typeof PRINCIPAL]
        >
      | undefined

    await runtime(
      {
        headers: { authorization: `Basic ${btoa('loutre:otter')}` },
      },
      async (value) => {
        provided = value
      },
    )

    expect(injectedService).toBe(userService)
    expect(provided).toEqual({ principal: { id: 'user-1' } })
  })

  it('最初のコロンだけをusernameとpasswordの境界にする', async () => {
    const authenticate = vi.fn(() => ({ principal: { id: 'user-1' } }))
    const authentication = basicAuth({
      realm: 'Loutre Test',
      provide: PRINCIPAL,
      factory: () => authenticate,
      unauthorized: {
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
      },
    })

    await runBasicAuth(authentication, {
      headers: { authorization: `basic ${btoa('user:pass:word')}` },
    })

    expect(authenticate).toHaveBeenCalledWith({
      username: 'user',
      password: 'pass:word',
    })
  })

  it('UTF-8の資格情報を認証callbackへ渡す', async () => {
    const bytes = new TextEncoder().encode('るーとる:かわうそ')
    const encoded = btoa(
      Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''),
    )
    const authenticate = vi.fn(() => ({ principal: { id: 'user-1' } }))
    const authentication = basicAuth({
      realm: 'Loutre Test',
      provide: PRINCIPAL,
      factory: () => authenticate,
      unauthorized: {
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
      },
    })

    await runBasicAuth(authentication, {
      headers: { authorization: `Basic ${encoded}` },
    })

    expect(authenticate).toHaveBeenCalledWith({
      username: 'るーとる',
      password: 'かわうそ',
    })
  })

  it.each([
    undefined,
    null,
    '',
    'Bearer token',
    'Basic !!!',
    `Basic ${btoa('no-separator')}`,
  ])('不正なheader %sを認証失敗にする', async (authorization) => {
    const authenticate = vi.fn(() => ({ principal: { id: 'user-1' } }))
    const authentication = basicAuth({
      realm: 'Loutre Test',
      provide: PRINCIPAL,
      factory: () => authenticate,
      unauthorized: {
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
      },
    })

    const { result } = await runBasicAuth(authentication, {
      headers: authorization == null ? {} : { authorization },
    })

    expect(isShortCircuit(result)).toBe(true)
    expect(result).toMatchObject({
      result: {
        kind: 'http-result',
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
        headers: {
          'www-authenticate': 'Basic realm="Loutre Test", charset="UTF-8"',
        },
      },
    })
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('factoryが認証結果を返さなければ401へshort circuitする', async () => {
    const authentication = basicAuth({
      realm: 'Loutre Test',
      provide: PRINCIPAL,
      factory: () => () => undefined,
      unauthorized: {
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
      },
    })

    const { result } = await runBasicAuth(authentication, {
      headers: { authorization: `Basic ${btoa('loutre:wrong')}` },
    })

    expect(isShortCircuit(result)).toBe(true)
  })

  it('realmをquoted-stringとしてescapeする', async () => {
    const authentication = basicAuth({
      realm: 'Loutre "Admin" \\ Area',
      provide: PRINCIPAL,
      factory: () => () => undefined,
      unauthorized: {
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
      },
    })

    const { result } = await runBasicAuth(authentication, { headers: {} })

    expect(result).toMatchObject({
      result: {
        headers: {
          'www-authenticate':
            'Basic realm="Loutre \\"Admin\\" \\\\ Area", charset="UTF-8"',
        },
      },
    })
  })

  it('空または制御文字を含むrealmを拒否する', () => {
    const create = (realm: string) =>
      basicAuth({
        realm,
        provide: PRINCIPAL,
        factory: () => () => undefined,
        unauthorized: {
          variant: 'unauthorized',
          body: { error: '認証が必要です' },
        },
      })

    expect(() => create('')).toThrow(TypeError)
    expect(() => create('Loutre\nAdmin')).toThrow(TypeError)
  })

  it.each([
    { status: undefined, code: 'LUTRE_SHORT_CIRCUIT_001' },
    { status: 403, code: 'LUTRE_SHORT_CIRCUIT_002' },
  ])('unauthorized responseの不整合を$codeで診断する', ({ status, code }) => {
    const authentication = basicAuth({
      realm: 'Loutre Test',
      provide: PRINCIPAL,
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
          path: '/auth-diagnostic',
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

  it('ユーザー定義Layerのresponse制約を診断する', () => {
    const authentication = layer({
      name: 'customAuthentication',
      role: 'authentication',
      shortCircuits: [
        {
          protocol: 'http',
          variant: 'unauthorized',
          response: { status: 401 },
        },
      ],
      factory: () => async (_ctx, next) => {
        await next()
      },
    })
    const status: number = 403
    const Contract = contract([
      // @ts-expect-error Graph fallbackを確認するためwidened statusを意図的に渡す
      http({
        get: {
          method: 'GET',
          path: '/custom-auth-diagnostic',
          responses: {
            unauthorized: {
              status,
              body: z.object({ error: z.string() }),
            },
          },
          pipeline: [authentication, http.controller],
        },
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
    ).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_SHORT_CIRCUIT_002' }),
    )
  })
})

async function runBasicAuth<
  TProvided extends import('@loutrejs/loutre').ContextField<any>,
  TVariant extends string,
  TBody,
>(
  authentication: BasicAuthLayerDescriptor<TProvided, TVariant, TBody>,
  context: BasicAuthContext,
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
