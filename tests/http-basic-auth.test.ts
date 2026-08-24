import {
  contextKey,
  contract,
  defineModule,
  implement,
  isShortCircuit,
  layer,
  procedure,
} from '@loutrefw/core'
import { compileApplication } from '@loutrefw/compiler'
import { basicAuth, http, type HttpProtocolDefinition } from '@loutrefw/http'
import { z } from 'zod'

describe('basicAuth', () => {
  const PRINCIPAL = contextKey('principal').of<{ readonly id: string }>()

  it('credentialsを認証してprincipalをContextへ追加する', async () => {
    const authenticate = vi.fn(() => ({ id: 'user-1' }))
    const authentication = basicAuth({
      realm: 'Loutre Test',
      principal: PRINCIPAL,
      authenticate,
      unauthorized: {
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
      },
    })

    await expect(
      authentication.inbound?.({
        headers: { authorization: `Basic ${btoa('loutre:otter')}` },
      }),
    ).resolves.toEqual({ principal: { id: 'user-1' } })
    expect(authenticate).toHaveBeenCalledWith({
      username: 'loutre',
      password: 'otter',
    })
    expect(authentication.role).toBe('authentication')
    expect(authentication.requiresValidated).toEqual([])
  })

  it('最初のコロンだけをusernameとpasswordの境界にする', async () => {
    const authenticate = vi.fn(() => ({ id: 'user-1' }))
    const authentication = basicAuth({
      realm: 'Loutre Test',
      principal: PRINCIPAL,
      authenticate,
      unauthorized: {
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
      },
    })

    await authentication.inbound?.({
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
    const authenticate = vi.fn(() => ({ id: 'user-1' }))
    const authentication = basicAuth({
      realm: 'Loutre Test',
      principal: PRINCIPAL,
      authenticate,
      unauthorized: {
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
      },
    })

    await authentication.inbound?.({
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
    const authenticate = vi.fn(() => ({ id: 'user-1' }))
    const authentication = basicAuth({
      realm: 'Loutre Test',
      principal: PRINCIPAL,
      authenticate,
      unauthorized: {
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
      },
    })

    const result = await authentication.inbound?.({
      headers: authorization == null ? {} : { authorization },
    })

    expect(isShortCircuit(result)).toBe(true)
    expect(result).toMatchObject({
      result: {
        kind: 'http-result',
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
        headers: {
          'www-authenticate':
            'Basic realm="Loutre Test", charset="UTF-8"',
        },
      },
    })
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('authenticateがprincipalを返さなければ401へshort circuitする', async () => {
    const authentication = basicAuth({
      realm: 'Loutre Test',
      principal: PRINCIPAL,
      authenticate: () => undefined,
      unauthorized: {
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
      },
    })

    const result = await authentication.inbound?.({
      headers: { authorization: `Basic ${btoa('loutre:wrong')}` },
    })
    expect(isShortCircuit(result)).toBe(true)
  })

  it('realmをquoted-stringとしてescapeする', async () => {
    const authentication = basicAuth({
      realm: 'Loutre "Admin" \\ Area',
      principal: PRINCIPAL,
      authenticate: () => undefined,
      unauthorized: {
        variant: 'unauthorized',
        body: { error: '認証が必要です' },
      },
    })

    const result = await authentication.inbound?.({ headers: {} })
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
        principal: PRINCIPAL,
        authenticate: () => undefined,
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
  ])(
    'unauthorized responseの不整合を$codeで診断する',
    ({ status, code }) => {
      const authentication = basicAuth({
        realm: 'Loutre Test',
        principal: PRINCIPAL,
        authenticate: () => undefined,
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
      const Contract = contract({
        get: procedure({
          protocols: {
            http: http(
              {
                method: 'GET',
                path: '/auth-diagnostic',
                responses,
                pipeline: [authentication, http.controller],
              } as never,
            ),
          },
        }),
      })
      class Implementation {
        get(): never {
          throw new Error('実行対象ではありません')
        }
      }
      const Module = defineModule(() => ({
        implementations: [implement(Contract).for(http).with(Implementation)],
      }))

      expect(compileApplication([Module()]).diagnostics).toContainEqual(
        expect.objectContaining({ code }),
      )
    },
  )

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
    })
    const status: number = 403
    const Contract = contract({
      get: procedure({
        protocols: {
          http: http({
            method: 'GET',
            path: '/custom-auth-diagnostic',
            responses: {
              unauthorized: {
                status,
                body: z.object({ error: z.string() }),
              },
            },
            pipeline: [authentication, http.controller],
          }),
        },
      }),
    })
    class Implementation {
      get(): never {
        throw new Error('実行対象ではありません')
      }
    }
    const Module = defineModule(() => ({
      implementations: [implement(Contract).for(http).with(Implementation)],
    }))

    expect(compileApplication([Module()]).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_SHORT_CIRCUIT_002' }),
    )
  })
})
