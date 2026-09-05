import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import {
  bootstrapApplication,
  type ApplicationExtensions,
  defineApplication,
  defineModule,
  type,
} from '@loutrejs/loutre'
import {
  basicAuth,
  bearerAuth,
  bindHttpServer,
  cors,
  http,
  type HttpExecutionContext,
  type HttpHostApi,
} from '@loutrejs/http'

describe('HTTP Execution Extension', () => {
  it('typeで宣言したMiddleware stateをhandlerへ渡す', async () => {
    const identity = http.middleware({
      name: 'identity',
      state: type<{ userId: string }>(),
      factory: () => async (_context, next) => next({ userId: 'user-42' }),
    })
    const contract = http.contract({
      profile: {
        method: 'GET',
        path: '/profile',
        middlewares: [identity],
        responses: { ok: { status: 200, body: z.string() } },
      },
    })
    const controller = http.implementation({
      contract,
      factory: () => ({
        profile: (context) =>
          context.response.ok({ body: context.state.userId }),
      }),
    })
    const Module = defineModule(() => ({ executions: [controller] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [bindHttpServer({ runtime: 'test' })],
    })
    try {
      const response = await application.http.fetch(
        new Request('http://fixture.test/profile'),
      )
      expect(await response.text()).toBe('user-42')
    } finally {
      await application.close()
    }
  })
  it('内部例外の詳細を500 responseへ公開しない', async () => {
    const contract = http.contract({
      failure: {
        method: 'GET',
        path: '/failure',
        responses: { ok: { status: 204 } },
      },
    })
    const controller = http.implementation({
      contract,
      factory: () => ({
        failure() {
          throw new Error('database-password=secret')
        },
      }),
    })
    const Module = defineModule(() => ({ executions: [controller] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [bindHttpServer({ runtime: 'test' })],
    })

    const response = await application.http.fetch(
      new Request('http://fixture.test/failure'),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Internal Server Error',
    })
    await application.close()
  })

  it('credential CORSのwildcardを拒否し特定originへVaryを付与する', async () => {
    expect(() => cors({ credentials: true })).toThrow(
      'CORS origin cannot be a wildcard',
    )

    const corsMiddleware = cors({ origin: ['https://app.example.com'] })
    const contract = http.contract({
      hello: {
        method: 'GET',
        path: '/hello',
        responses: { ok: { status: 204 } },
        middlewares: [corsMiddleware],
      },
    })
    const controller = http.implementation({
      contract,
      factory: () => ({ hello: (context) => context.response.ok({}) }),
    })
    const Module = defineModule(() => ({ executions: [controller] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [bindHttpServer({ runtime: 'test' })],
    })

    const response = await application.http.fetch(
      new Request('http://fixture.test/hello', {
        headers: { origin: 'https://app.example.com' },
      }),
    )

    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://app.example.com',
    )
    expect(response.headers.get('vary')).toBe('Origin')
    await application.close()
  })

  it('固定headerと動的headerをheadersで統一してmergeする', async () => {
    const contract = http.contract({
      headers: {
        method: 'GET',
        path: '/headers',
        responses: {
          ok: {
            status: 200,
            body: z.object({ ok: z.boolean() }),
            headers: {
              schema: z.object({
                'x-dynamic': z.string(),
                'x-overridden': z.string(),
              }),
              defaults: {
                'x-static': 'static',
                'x-overridden': 'default',
              },
            },
          },
        },
      },
    })
    const controller = http.implementation({
      contract,
      factory: () => ({
        headers: (context) =>
          context.response.ok({
            body: { ok: true },
            headers: {
              'x-dynamic': 'dynamic',
              'x-overridden': 'dynamic',
            },
          }),
      }),
    })
    const Module = defineModule(() => ({ executions: [controller] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [bindHttpServer({ runtime: 'test' })],
    })

    const response = await application.http.fetch(
      new Request('http://fixture.test/headers'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-static')).toBe('static')
    expect(response.headers.get('x-dynamic')).toBe('dynamic')
    expect(response.headers.get('x-overridden')).toBe('dynamic')
    await application.close()
  })

  it('HTTP semanticsをExtension内でcompileしてdispatchする', async () => {
    const contract = http.contract({
      getUser: {
        method: 'GET',
        path: '/users/{id}',
        request: {
          params: { id: z.string().min(1) },
          query: z.object({ detail: z.string().optional() }),
        },
        responses: {
          found: {
            status: 200,
            body: z.object({ id: z.string(), detail: z.string().optional() }),
          },
        },
      },
    })
    const controller = http.implementation({
      name: 'users.http',
      contract,
      factory: () => ({
        getUser: async (context) =>
          context.response.found({
            body: {
              id: context.params.id,
              detail: context.query.detail,
            },
          }),
      }),
    })
    const Module = defineModule(() => ({ executions: [controller] }))
    const definition = defineApplication({ modules: [Module()] })
    const extensionTypeCheck: ApplicationExtensions<typeof definition> =
      controller.extension
    expect(extensionTypeCheck).toBe(http.extension)
    const application = await bootstrapApplication({
      application: definition,
      capabilities: [bindHttpServer({ runtime: 'test' })],
    })

    expectTypeOf(application.http).toEqualTypeOf<HttpHostApi>()
    expectTypeOf<
      Parameters<ReturnType<typeof controller.factory>['getUser']>[0]
    >().toEqualTypeOf<
      HttpExecutionContext<(typeof contract.routes)['getUser']>
    >()

    const response = await application.http.fetch(
      new Request('http://fixture.test/users/42?detail=full'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      id: '42',
      detail: 'full',
    })
    expect(application.graph.executions).toContainEqual(
      expect.objectContaining({
        id: 'users.http',
        executionKind: 'http.request',
        extension: expect.objectContaining({ name: '@loutrejs/http' }),
      }),
    )
    await application.close()
  })

  it('重複routeをHTTP Extensionのglobal validationで拒否する', () => {
    const contract = http.contract({
      first: {
        method: 'GET',
        path: '/users/{first}',
        responses: { ok: { status: 204 } },
      },
      second: {
        method: 'get',
        path: '/users/{second}',
        responses: { ok: { status: 204 } },
      },
    })
    const controller = http.implementation({
      name: 'duplicate.http',
      contract,
      factory: () => ({
        first: (context) => context.response.ok({}),
        second: (context) => context.response.ok({}),
      }),
    })
    const Module = defineModule(() => ({ executions: [controller] }))

    const definition = defineApplication({ modules: [Module()] })

    expect(definition.model.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_HTTP_DUPLICATE_ROUTE' }),
    )
  })
  it('generic LayerのDI・state・short-circuitをHTTP middlewareへ合成する', async () => {
    class UserRepository {
      authenticate(username: string, password: string) {
        return username === 'かわうそ' && password === '秘密'
          ? { id: 'user-1', name: 'Loutre User' }
          : undefined
      }
    }

    const authentication = basicAuth({
      name: 'profile.basic-auth',
      realm: 'Loutre Test',
      inject: [UserRepository],
      factory: (users) => ({
        authenticate({ username, password }) {
          const currentUser = users.authenticate(username, password)
          return currentUser ? { currentUser } : undefined
        },
        unauthorized() {
          return {
            response: 'unauthorized',
            body: { error: 'Authentication required' },
          }
        },
      }),
    })
    const contract = http.contract({
      profile: {
        method: 'GET',
        path: '/profile',
        responses: {
          ok: {
            status: 200,
            body: z.object({ id: z.string(), name: z.string() }),
          },
          unauthorized: {
            status: 401,
            body: z.object({ error: z.string() }),
            headers: z.object({ 'www-authenticate': z.string() }),
          },
        },
        middlewares: [authentication],
      },
    })
    const controller = http.implementation({
      name: 'profile.http',
      contract,
      factory: () => ({
        profile: (context) =>
          context.response.ok({ body: context.state.currentUser }),
      }),
    })
    const Module = defineModule(() => ({
      providers: [UserRepository],
      executions: [controller],
    }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [bindHttpServer({ runtime: 'test' })],
    })

    const unauthorized = await application.http.fetch(
      new Request('http://fixture.test/profile'),
    )
    expect(unauthorized.status).toBe(401)
    expect(unauthorized.headers.get('www-authenticate')).toBe(
      'Basic realm="Loutre Test", charset="UTF-8"',
    )

    const authorized = await application.http.fetch(
      new Request('http://fixture.test/profile', {
        headers: {
          authorization: `basic ${base64Utf8('かわうそ:秘密')}`,
        },
      }),
    )
    expect(authorized.status).toBe(200)
    await expect(authorized.json()).resolves.toEqual({
      id: 'user-1',
      name: 'Loutre User',
    })
    await application.close()
  })

  it('Bearer schemeを大小文字に依存せず解釈する', async () => {
    const authentication = bearerAuth({
      realm: 'Loutre Test',
      factory: () => ({
        authenticate: (token: string) =>
          token === 'valid-token' ? { authenticated: true } : undefined,
        unauthorized: () => ({
          response: 'unauthorized',
          body: { error: 'Authentication required' },
        }),
      }),
    })
    const contract = http.contract({
      profile: {
        method: 'GET',
        path: '/bearer-profile',
        responses: {
          ok: { status: 204 },
          unauthorized: {
            status: 401,
            body: z.object({ error: z.string() }),
            headers: z.object({ 'www-authenticate': z.string() }),
          },
        },
        middlewares: [authentication],
      },
    })
    const controller = http.implementation({
      contract,
      factory: () => ({ profile: (context) => context.response.ok({}) }),
    })
    const Module = defineModule(() => ({ executions: [controller] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [bindHttpServer({ runtime: 'test' })],
    })

    const response = await application.http.fetch(
      new Request('http://fixture.test/bearer-profile', {
        headers: { authorization: 'bearer valid-token' },
      }),
    )

    expect(response.status).toBe(204)
    await application.close()
  })
})

function base64Utf8(value: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(value)))
}
