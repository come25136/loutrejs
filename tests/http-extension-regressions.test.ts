import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  bootstrapApplication,
  defineApplication,
  defineModule,
} from '@loutrejs/loutre'
import {
  basicAuth,
  bindHttpServer,
  cors,
  http,
  type HttpContract,
  type HttpImplementationDefinition,
} from '@loutrejs/loutre/http'
import { generateOpenApi } from '@loutrejs/loutre/http/openapi'

async function createHttpApplication<const TContract extends HttpContract>(
  contract: TContract,
  factory: HttpImplementationDefinition<TContract>['factory'],
) {
  const implementation = http.implementation({ contract, factory })
  const Module = defineModule(() => ({ executions: [implementation] }))
  return bootstrapApplication({
    application: defineApplication({ modules: [Module()] }),
    capabilities: [bindHttpServer({ runtime: 'test' })],
  })
}

describe('HTTP Execution Extension regression', () => {
  it('schema未宣言のqueryとheadersをplain recordで渡す', async () => {
    const contract = http.contract({
      inspect: {
        method: 'GET',
        path: '/inspect',
        responses: {
          ok: {
            status: 200,
            body: z.object({
              tags: z.union([z.string(), z.array(z.string())]),
              contentType: z.string(),
            }),
          },
        },
      },
    })
    const application = await createHttpApplication(contract, () => ({
      inspect: (context) => {
        const tag = context.input.query.tag
        return context.response.ok({
          body: {
            tags:
              tag === undefined ? '' : typeof tag === 'string' ? tag : [...tag],
            contentType: context.input.headers['content-type'] ?? '',
          },
        })
      },
    }))
    try {
      const response = await application.http.fetch(
        new Request('http://fixture.test/inspect?tag=a&tag=b', {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        }),
      )
      await expect(response.json()).resolves.toEqual({
        tags: ['a', 'b'],
        contentType: 'text/plain; charset=utf-8',
      })
    } finally {
      await application.close()
    }
  })
  it('path decode errorを400にする', async () => {
    const contract = http.contract({
      user: {
        method: 'GET',
        path: '/users/{id}',
        responses: { ok: { status: 204 } },
      },
    })
    const application = await createHttpApplication(contract, () => ({
      user: (context) => context.response.ok({}),
    }))
    try {
      const response = await application.http.fetch(
        new Request('http://fixture.test/users/%E0%A4%A'),
      )
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: 'Invalid request',
      })
    } finally {
      await application.close()
    }
  })

  it('static routeをparameter routeより優先する', async () => {
    const contract = http.contract({
      dynamic: {
        method: 'GET',
        path: '/users/{id}',
        responses: { ok: { status: 200, body: z.string() } },
      },
      static: {
        method: 'GET',
        path: '/users/new',
        responses: { ok: { status: 200, body: z.string() } },
      },
    })
    const application = await createHttpApplication(contract, () => ({
      dynamic: (context) => context.response.ok({ body: 'dynamic' }),
      static: (context) => context.response.ok({ body: 'static' }),
    }))
    try {
      const response = await application.http.fetch(
        new Request('http://fixture.test/users/new'),
      )
      expect(await response.text()).toBe('static')
    } finally {
      await application.close()
    }
  })

  it('queryの同名keyをstring[]として保持する', async () => {
    const Query = z.object({ tags: z.union([z.string(), z.array(z.string())]) })
    const contract = http.contract({
      search: {
        method: 'GET',
        path: '/search',
        request: { query: Query },
        responses: { ok: { status: 200, body: Query } },
      },
    })
    const application = await createHttpApplication(contract, () => ({
      search: (context) => context.response.ok({ body: context.input.query }),
    }))
    try {
      const response = await application.http.fetch(
        new Request('http://fixture.test/search?tags=a&tags=b'),
      )
      await expect(response.json()).resolves.toEqual({ tags: ['a', 'b'] })
    } finally {
      await application.close()
    }
  })

  it('validated Content-TypeからJSONと+jsonをdecodeする', async () => {
    const Body = z.object({ value: z.string() })
    const Headers = z.object({
      'content-type': z.union([
        z.literal('application/json'),
        z.literal('application/problem+json'),
      ]),
    })
    const contract = http.contract({
      create: {
        method: 'POST',
        path: '/items',
        request: { headers: Headers, body: Body },
        responses: { ok: { status: 200, body: Body } },
      },
    })
    const application = await createHttpApplication(contract, () => ({
      create: (context) => context.response.ok({ body: context.input.body }),
    }))
    try {
      const normalized = await application.http.fetch(
        new Request('http://fixture.test/items', {
          method: 'POST',
          headers: { 'content-type': 'Application/JSON ; charset=UTF-8' },
          body: JSON.stringify({ value: 'normalized' }),
        }),
      )
      expect(normalized.status).toBe(200)
      await expect(normalized.json()).resolves.toEqual({ value: 'normalized' })

      const suffix = await application.http.fetch(
        new Request('http://fixture.test/items', {
          method: 'POST',
          headers: { 'content-type': 'application/problem+json' },
          body: JSON.stringify({ value: 'suffix' }),
        }),
      )
      expect(suffix.status).toBe(200)
      await expect(suffix.json()).resolves.toEqual({ value: 'suffix' })
    } finally {
      await application.close()
    }
  })

  it('multipart/form-dataをContractのContent-Typeに従ってdecodeする', async () => {
    const Form = z.custom<FormData>((value) => value instanceof FormData)
    const contract = http.contract({
      upload: {
        method: 'POST',
        path: '/upload',
        request: {
          headers: z.object({
            'content-type': z.literal('multipart/form-data'),
          }),
          body: Form,
        },
        responses: { ok: { status: 200, body: z.string() } },
      },
    })
    const application = await createHttpApplication(contract, () => ({
      upload: (context) =>
        context.response.ok({ body: String(context.input.body.get('name')) }),
    }))
    try {
      const form = new FormData()
      form.set('name', 'loutre')
      const response = await application.http.fetch(
        new Request('http://fixture.test/upload', {
          method: 'POST',
          body: form,
        }),
      )
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('loutre')
    } finally {
      await application.close()
    }
  })

  it('CORS preflightをOPTIONS routeなしで204完結する', async () => {
    const middleware = cors({ origin: ['https://app.example.com'] })
    const contract = http.contract({
      create: {
        method: 'POST',
        path: '/messages',
        responses: { ok: { status: 204 } },
        middlewares: [middleware],
      },
    })
    const application = await createHttpApplication(contract, () => ({
      create: (context) => context.response.ok({}),
    }))
    try {
      const response = await application.http.fetch(
        new Request('http://fixture.test/messages', {
          method: 'OPTIONS',
          headers: {
            origin: 'https://app.example.com',
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'x-request-id',
          },
        }),
      )
      expect(response.status).toBe(204)
      expect(response.headers.get('access-control-allow-origin')).toBe(
        'https://app.example.com',
      )
      expect(response.headers.get('access-control-allow-methods')).toBe('POST')
      expect(response.headers.get('access-control-allow-headers')).toBe(
        'x-request-id',
      )
      expect(response.headers.get('vary')).toContain(
        'Access-Control-Request-Method',
      )
      expect(response.headers.get('vary')).toContain(
        'Access-Control-Request-Headers',
      )
    } finally {
      await application.close()
    }
  })

  it('pending CORS preflightをshutdown timeoutの対象として追跡する', async () => {
    let markOriginStarted!: () => void
    const originStarted = new Promise<void>((resolve) => {
      markOriginStarted = resolve
    })
    let resolveOrigin!: (allowed: boolean) => void
    const originDecision = new Promise<boolean>((resolve) => {
      resolveOrigin = resolve
    })
    const middleware = cors({
      origin: async () => {
        markOriginStarted()
        return originDecision
      },
    })
    const contract = http.contract({
      create: {
        method: 'POST',
        path: '/messages',
        responses: { ok: { status: 204 } },
        middlewares: [middleware],
      },
    })
    const implementation = http.implementation({
      contract,
      factory: () => ({ create: (context) => context.response.ok({}) }),
    })
    const Module = defineModule(() => ({ executions: [implementation] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [bindHttpServer({ runtime: 'test' })],
      forceShutdownTimeoutMs: 10,
    })
    const preflight = application.http.fetch(
      new Request('http://fixture.test/messages', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://app.example.com',
          'access-control-request-method': 'POST',
        },
      }),
    )
    await originStarted

    try {
      await expect(
        Promise.race([
          application.close(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('shutdown hung')), 100),
          ),
        ]),
      ).rejects.toThrow(
        'Application shutdown did not reach a safe cleanup boundary.',
      )
    } finally {
      resolveOrigin(true)
      await preflight.catch(() => undefined)
      await application.close().catch(() => undefined)
    }
  })

  it('CORS denyでもVary: Originを返しpredicate originを許可する', async () => {
    const middleware = cors({
      origin: async (origin) => origin.endsWith('.example.com'),
    })
    const contract = http.contract({
      get: {
        method: 'GET',
        path: '/resource',
        responses: { ok: { status: 204 } },
        middlewares: [middleware],
      },
    })
    const application = await createHttpApplication(contract, () => ({
      get: (context) => context.response.ok({}),
    }))
    try {
      const denied = await application.http.fetch(
        new Request('http://fixture.test/resource', {
          headers: { origin: 'https://evil.invalid' },
        }),
      )
      expect(denied.headers.get('access-control-allow-origin')).toBeNull()
      expect(denied.headers.get('vary')).toBe('Origin')

      const allowed = await application.http.fetch(
        new Request('http://fixture.test/resource', {
          headers: { origin: 'https://app.example.com' },
        }),
      )
      expect(allowed.headers.get('access-control-allow-origin')).toBe(
        'https://app.example.com',
      )
    } finally {
      await application.close()
    }
  })

  it('CORS optionとauthentication realmを定義時に検証する', () => {
    expect(() => cors({ allowMethods: ['not a method'] })).toThrow(
      'invalid HTTP token',
    )
    expect(() => cors({ maxAge: -1 })).toThrow('non-negative safe integer')
    expect(() =>
      basicAuth({
        realm: 'bad\r\nrealm',
        factory: () => ({
          authenticate: () => undefined,
          unauthorized: () => ({ response: 'unauthorized', body: undefined }),
        }),
      }),
    ).toThrow('cannot be empty or contain control characters')
  })

  it('Application Model構築後のraw HTTP Contract mutationをRuntime/OpenAPIへ漏らさない', async () => {
    const route = {
      method: 'GET',
      path: '/snapshot',
      responses: { ok: { status: 200 } },
    } as const
    const contract = http.contract({ snapshot: route })
    const implementation = http.implementation({
      contract,
      factory: () => ({ snapshot: (context) => context.response.ok({}) }),
    })
    const Module = defineModule(() => ({ executions: [implementation] }))
    const definition = defineApplication({ modules: [Module()] })

    ;(route as { method: string }).method = 'POST'
    ;(route as { path: string }).path = '/mutated'
    ;(route.responses.ok as { status: number }).status = 201

    const document = generateOpenApi(definition.model, {
      info: { title: 'snapshot', version: '1.0.0' },
    })
    expect(document.paths).toHaveProperty('/snapshot')
    expect(document.paths).not.toHaveProperty('/mutated')
    expect(
      (document.paths['/snapshot']?.get as { responses?: unknown } | undefined)
        ?.responses,
    ).toHaveProperty('200')

    const application = await bootstrapApplication({
      application: definition,
      capabilities: [bindHttpServer({ runtime: 'test' })],
    })
    try {
      const response = await application.http.fetch(
        new Request('http://fixture.test/snapshot'),
      )
      expect(response.status).toBe(200)
    } finally {
      await application.close()
    }
  })

  it('dynamic contractでもstatus/bodyless/params/body headers invariantを検証する', () => {
    expect(() =>
      http.contract({
        invalid: {
          method: 'GET',
          path: '/invalid',
          responses: { ok: { status: 199 } },
        },
      } as never),
    ).toThrow('invalid status')

    expect(() =>
      http.contract({
        invalid: {
          method: 'GET',
          path: '/invalid',
          responses: { ok: { status: 204, body: z.string() } },
        },
      } as never),
    ).toThrow('cannot declare a body')

    expect(() =>
      http.contract({
        invalid: {
          method: 'GET',
          path: '/users/{id}',
          request: { params: { other: z.string() } },
          responses: { ok: { status: 204 } },
        },
      } as never),
    ).toThrow('must exactly match path parameters')

    expect(() =>
      http.contract({
        invalid: {
          method: 'POST',
          path: '/items',
          request: { body: z.string() },
          responses: { ok: { status: 204 } },
        },
      } as never),
    ).toThrow('declares a body but no request headers schema')
  })
})
