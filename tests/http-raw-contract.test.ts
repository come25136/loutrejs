import { describe, expect, it } from 'vitest'
import { bootstrapApplication, application, module } from '@loutrejs/loutre'
import {
  bindHttpServer,
  http,
  isHttpRawContractRoute,
  isHttpContract,
} from '@loutrejs/loutre/http'
import { generateOpenApi } from '@loutrejs/loutre/http/openapi'

function contract() {
  const state = http.middleware<{ tenant: string }>({
    name: 'Tenant',
    factory: () => async (_input, next) => next({ tenant: 'もみじ' }),
  })
  return http.contract({
    api: {
      path: '/api',
      middlewares: [state],
      routes: {
        health: {
          method: 'GET',
          path: '/health',
          responses: { ok: { status: 204 } },
        },
        delegated: { raw: true, method: '*', path: '/protocol' },
      },
    },
  })
}

describe('HTTP Contractのrawルート', () => {
  it('pathとmiddlewareを継承し、正規化済みの参照を読み取り専用で返す', () => {
    const httpContract = contract()
    expect(httpContract.routes.delegated.path).toBe('/api/protocol')
    expect(httpContract.routes.delegated.middlewares).toHaveLength(1)
    expect(isHttpRawContractRoute(httpContract.routes.delegated)).toBe(true)
    expect(
      isHttpRawContractRoute({ raw: true, method: '*', path: '/protocol' }),
    ).toBe(false)
    expect(isHttpRawContractRoute({ ...httpContract.routes.delegated })).toBe(
      false,
    )
    expect(
      isHttpRawContractRoute(Object.create(httpContract.routes.delegated)),
    ).toBe(false)
    expect(isHttpRawContractRoute(httpContract.routes.health)).toBe(false)
    expect(Object.isFrozen(httpContract.routes.delegated)).toBe(true)
  })

  it('コピーしたContractのルートとコンパイル済みルートを混在させない', () => {
    const httpContract = contract()
    const copy = {
      ...httpContract,
      routes: {
        ...httpContract.routes,
        health: { ...httpContract.routes.health, path: '/changed' },
      },
    }
    expect(isHttpContract(copy)).toBe(false)
    expect(isHttpContract(Object.create(httpContract))).toBe(false)
    expect(() =>
      http.implementation({
        contract: copy,
        factory: () => {
          throw new Error('呼び出される前に拒否される')
        },
      }),
    ).toThrow('http.contract()')
  })

  it('通常HTTPのimplementationとraw処理を同じContractから個別に配備する', async () => {
    const httpContract = contract()
    const regular = http.implementation({
      contract: httpContract,
      factory: () => ({ health: () => ({ schema: httpContract.health.ok }) }),
    })
    const delegated = http.raw({
      route: httpContract.routes.delegated,
      factory: () => (ctx) => Response.json(ctx.state),
    })
    const Module = module(() => ({ executions: [regular, delegated] }))
    const definition = application({ modules: [Module()] })
    expect(definition.model.executions.map(({ compiled }) => compiled)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'contract',
          routes: [expect.objectContaining({ kind: 'contract' })],
        }),
        expect.objectContaining({
          kind: 'raw',
          routes: [expect.objectContaining({ kind: 'raw' })],
        }),
      ]),
    )
    const app = await bootstrapApplication({
      application: definition,
      capabilities: [bindHttpServer({ runtime: 'test' })],
    })
    try {
      expect(
        (await app.http.fetch(new Request('http://test/api/health'))).status,
      ).toBe(204)
      expect(
        await (
          await app.http.fetch(new Request('http://test/api/protocol'))
        ).json(),
      ).toEqual({ tenant: 'もみじ' })
      expect(
        (await app.http.fetch(new Request('http://test/protocol'))).status,
      ).toBe(404)
    } finally {
      await app.close()
    }
  })

  it('OpenAPIには通常HTTPのルートだけを出す', () => {
    const httpContract = contract()
    expect(
      Object.keys(
        generateOpenApi(httpContract, { info: { title: '試験', version: '1' } })
          .paths,
      ),
    ).toEqual(['/api/health'])
  })

  it('rawでないルートのresponsesの書き忘れを拒否する', () => {
    expect(() =>
      http.contract({ invalid: { method: 'GET', path: '/invalid' } } as never),
    ).toThrow()
  })

  it('rawルートへHTTP response variantを継承しない', () => {
    expect(() =>
      http.contract({
        api: {
          responses: { error: { status: 401 } },
          routes: { delegated: { raw: true, method: '*', path: '/protocol' } },
        },
      } as never),
    ).toThrow('Raw routes cannot declare or inherit')
  })
})
