import { describe, expect, it } from 'vitest'
import {
  bootstrapApplication,
  defineApplication,
  defineModule,
} from '@loutrejs/loutre'
import {
  bindHttpServer,
  createHttpClient,
  http,
  isHttpRawContractRoute,
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
    const api = contract()
    expect(api.routes.delegated.path).toBe('/api/protocol')
    expect(api.routes.delegated.middlewares).toHaveLength(1)
    expect(isHttpRawContractRoute(api.routes.delegated)).toBe(true)
    expect(
      isHttpRawContractRoute({ raw: true, method: '*', path: '/protocol' }),
    ).toBe(false)
    expect(isHttpRawContractRoute(api.routes.health)).toBe(false)
    expect(Object.isFrozen(api.routes.delegated)).toBe(true)
  })

  it('通常HTTPのimplementationとraw処理を同じContractから個別に配備する', async () => {
    const api = contract()
    const regular = http.implementation({
      contract: api,
      factory: () => ({ health: (ctx) => ctx.response.ok({}) }),
    })
    const delegated = http.raw({
      route: api.routes.delegated,
      factory: () => (ctx) => Response.json(ctx.state),
    })
    const Module = defineModule(() => ({ executions: [regular, delegated] }))
    const app = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
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

  it('OpenAPIと型付きHTTP clientには通常HTTPのルートだけを出す', () => {
    const api = contract()
    expect(
      Object.keys(
        generateOpenApi(api, { info: { title: '試験', version: '1' } }).paths,
      ),
    ).toEqual(['/api/health'])
    const client = createHttpClient(api, async () => ({
      status: 204,
      body: undefined,
    }))
    expect(Object.keys(client)).toEqual(['health'])
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
