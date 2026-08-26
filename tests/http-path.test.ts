import {
  contract,
  defineModule,
  implementation,
  procedure,
} from '@loutrejs/core'
import { assertValidCompilation, compileApplication } from '@loutrejs/graph'
import {
  createHttpApplication,
  http,
  validate,
} from '@loutrejs/http'
import { validateHttpParamsSchemas } from '../packages/http/src/params.js'
import { z } from 'zod'

const Result = z.object({ route: z.string(), value: z.unknown() })

function createRoutingApplication() {
  const Contract = contract({
    raw: procedure({
      protocols: {
        http: http({
          method: 'GET',
          path: '/raw/{id}',
          responses: { ok: { status: 200, body: Result } },
          pipeline: [http.controller],
        }),
      },
    }),
    declaredOnly: procedure({
      protocols: {
        http: http({
          method: 'GET',
          path: '/declared/{id}',
          request: { params: { id: z.coerce.number() } },
          responses: { ok: { status: 200, body: Result } },
          pipeline: [http.controller],
        }),
      },
    }),
    multiple: procedure({
      protocols: {
        http: http({
          method: 'GET',
          path: '/users/{userId}/posts/{postId}',
          request: {
            params: {
              userId: z.coerce.number(),
              postId: z.string(),
            },
          },
          responses: { ok: { status: 200, body: Result } },
          pipeline: [validate.params, http.controller],
        }),
      },
    }),
    dynamic: procedure({
      protocols: {
        http: http({
          method: 'GET',
          path: '/priority/{id}',
          responses: { ok: { status: 200, body: Result } },
          pipeline: [http.controller],
        }),
      },
    }),
    static: procedure({
      protocols: {
        http: http({
          method: 'GET',
          path: '/priority/me',
          responses: { ok: { status: 200, body: Result } },
          pipeline: [http.controller],
        }),
      },
    }),
    lessSpecific: procedure({
      protocols: {
        http: http({
          method: 'GET',
          path: '/specific/{x}/c',
          responses: { ok: { status: 200, body: Result } },
          pipeline: [http.controller],
        }),
      },
    }),
    moreSpecific: procedure({
      protocols: {
        http: http({
          method: 'GET',
          path: '/specific/b/{y}',
          responses: { ok: { status: 200, body: Result } },
          pipeline: [http.controller],
        }),
      },
    }),
    getMethod: procedure({
      protocols: {
        http: http({
          method: 'GET',
          path: '/method/{id}',
          responses: { ok: { status: 200, body: Result } },
          pipeline: [http.controller],
        }),
      },
    }),
    postMethod: procedure({
      protocols: {
        http: http({
          method: 'POST',
          path: '/method/{id}',
          responses: { ok: { status: 200, body: Result } },
          pipeline: [http.controller],
        }),
      },
    }),
  })
  const Implementation = implementation({
    name: 'Implementation',
    contract: Contract,
    protocol: http,
    factory: () => ({
      raw(ctx) {
        return ctx.response.ok({
          body: { route: 'raw', value: ctx.params.id },
        })
      },
      declaredOnly(ctx) {
        return ctx.response.ok({
          body: { route: 'declared', value: ctx.params.id },
        })
      },
      multiple(ctx) {
        return ctx.response.ok({
          body: { route: 'multiple', value: ctx.params },
        })
      },
      dynamic(ctx) {
        return ctx.response.ok({
          body: { route: 'dynamic', value: ctx.params.id },
        })
      },
      static(ctx) {
        return ctx.response.ok({ body: { route: 'static', value: null } })
      },
      lessSpecific(ctx) {
        return ctx.response.ok({
          body: { route: 'less', value: ctx.params.x },
        })
      },
      moreSpecific(ctx) {
        return ctx.response.ok({
          body: { route: 'more', value: ctx.params.y },
        })
      },
      getMethod(ctx) {
        return ctx.response.ok({
          body: { route: 'get', value: ctx.params.id },
        })
      },
      postMethod(ctx) {
        return ctx.response.ok({
          body: { route: 'post', value: ctx.params.id },
        })
      },
    }),
  })
  const Module = defineModule(() => ({
    implementations: [Implementation],
  }))
  return createHttpApplication({ modules: [Module()] })
}

describe('HTTP pathとroute identity', () => {
  it('raw paramsのdecodeとproperty-wise transformを行う', async () => {
    const application = createRoutingApplication()

    const raw = await application.handle(
      new Request('http://fixture.test/raw/hello%20world'),
    )
    expect(await raw.json()).toEqual({ route: 'raw', value: 'hello world' })

    const declaredOnly = await application.handle(
      new Request('http://fixture.test/declared/123'),
    )
    expect(await declaredOnly.json()).toEqual({
      route: 'declared',
      value: '123',
    })

    const multiple = await application.handle(
      new Request('http://fixture.test/users/123/posts/456'),
    )
    expect(await multiple.json()).toEqual({
      route: 'multiple',
      value: { userId: 123, postId: '456' },
    })

    const invalidEncoding = await application.handle(
      new Request('http://fixture.test/raw/%E0%A4%A'),
    )
    expect(invalidEncoding.status).toBe(400)
  })

  it('static優先度と左からのspecificityが登録順に依存しない', async () => {
    const application = createRoutingApplication()
    const staticResponse = await application.handle(
      new Request('http://fixture.test/priority/me'),
    )
    expect(await staticResponse.json()).toEqual({ route: 'static', value: null })

    const deeperResponse = await application.handle(
      new Request('http://fixture.test/specific/b/c'),
    )
    expect(await deeperResponse.json()).toEqual({ route: 'more', value: 'c' })

    const ReverseContract = contract({
      static: procedure({
        protocols: {
          http: http({
            method: 'GET',
            path: '/reverse/me',
            responses: { ok: { status: 200, body: z.string() } },
            pipeline: [http.controller],
          }),
        },
      }),
      dynamic: procedure({
        protocols: {
          http: http({
            method: 'GET',
            path: '/reverse/{id}',
            responses: { ok: { status: 200, body: z.string() } },
            pipeline: [http.controller],
          }),
        },
      }),
    })
    const ReverseImplementation = implementation({
      name: 'ReverseImplementation',
      contract: ReverseContract,
      protocol: http,
      factory: () => ({
        static(ctx) {
          return ctx.response.ok({ body: 'static' })
        },
        dynamic(ctx) {
          return ctx.response.ok({ body: `dynamic:${ctx.params.id}` })
        },
      }),
    })
    const ReverseModule = defineModule(() => ({
      implementations: [ReverseImplementation],
    }))
    const reverseApplication = createHttpApplication({
      modules: [ReverseModule()],
    })
    const reverseResponse = await reverseApplication.handle(
      new Request('http://fixture.test/reverse/me'),
    )
    expect(await reverseResponse.json()).toBe('static')
  })

  it('methodが異なる同一pathを別routeとしてdispatchする', async () => {
    const application = createRoutingApplication()
    const getResponse = await application.handle(
      new Request('http://fixture.test/method/1'),
    )
    const postResponse = await application.handle(
      new Request('http://fixture.test/method/1', { method: 'POST' }),
    )
    expect((await getResponse.json()).route).toBe('get')
    expect((await postResponse.json()).route).toBe('post')
  })

  it('validation issue pathへparam名をprefixする', async () => {
    const nestedSchema = z
      .string()
      .transform(() => ({ nested: '' }))
      .pipe(z.object({ nested: z.string().min(1) }))

    await expect(
      validateHttpParamsSchemas({ id: nestedSchema }, { id: 'value' }),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ['id', 'nested'] })],
    })
    await expect(
      validateHttpParamsSchemas({ id: z.number() }, { id: 'value' }),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ['id'] })],
    })
  })

  it('runtimeでも無効なpathとparams schema keyを拒否する', () => {
    for (const path of [
      '/users/{id?}',
      '/files/{*rest}',
      '/users/{}',
      '/users/{2id}',
      '/users/{user-id}',
      '/users/{id}/{id}',
      '/users/foo-{id}',
      '/users/',
      '/users//posts',
      '/users?foo=bar',
      '/users#fragment',
    ]) {
      expect(() =>
        http({
          method: 'GET',
          path,
          responses: { ok: { status: 200, body: z.string() } },
          pipeline: [http.controller],
        } as never),
      ).toThrow()
    }

    expect(() =>
      http({
        method: 'GET',
        path: '/users/{id}',
        request: { params: { userId: z.string() } },
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [validate.params, http.controller],
      } as never),
    ).toThrow(/must match/)

    expect(() =>
      http({
        method: 'GET',
        path: '/users/{id}',
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [validate.params, http.controller],
      } as never),
    ).toThrow(/requires request.params/)
  })

  it('method uppercase・param名除外・rootをdispatchKeyへ反映する', () => {
    const first = http({
      method: 'get',
      path: '/users/{id}/posts/{postId}',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    })
    const second = http({
      method: 'GET',
      path: '/users/{userId}/posts/{id}',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    })
    const root = http({
      method: 'GET',
      path: '/',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    })

    expect(first.dispatchKey).toBe('http:GET:/users/{}/posts/{}')
    expect(second.dispatchKey).toBe(first.dispatchKey)
    expect(root.dispatchKey).toBe('http:GET:/')
  })
})

describe('protocol dispatchKeyの重複検査', () => {
  it('unsafe castで型検査を迂回しても同一Contract内の重複を拒否する', () => {
    const first = procedure({
      protocols: {
        http: http({
          method: 'GET',
          path: '/duplicate/{id}',
          responses: { ok: { status: 200, body: z.string() } },
          pipeline: [http.controller],
        }),
      },
    })
    const second = procedure({
      protocols: {
        http: http({
          method: 'get',
          path: '/duplicate/{userId}',
          responses: { ok: { status: 200, body: z.string() } },
          pipeline: [http.controller],
        }),
      },
    })

    expect(() =>
      contract({ first, second } as any, { name: 'DuplicateContract' }),
    ).toThrow(/Duplicate protocol dispatch key "http:GET:\/duplicate\/\{\}"/)
  })

  it('別Contract間の重複をGraph diagnosticにする', () => {
    const FirstContract = contract(
      {
        get: procedure({
          protocols: {
            http: http({
              method: 'GET',
              path: '/graph/{id}',
              responses: { ok: { status: 200, body: z.string() } },
              pipeline: [http.controller],
            }),
          },
        }),
      },
      { name: 'FirstContract' },
    )
    const SecondContract = contract(
      {
        get: procedure({
          protocols: {
            http: http({
              method: 'get',
              path: '/graph/{userId}',
              responses: { ok: { status: 200, body: z.string() } },
              pipeline: [http.controller],
            }),
          },
        }),
      },
      { name: 'SecondContract' },
    )
    const FirstController = implementation({
      name: 'FirstController',
      contract: FirstContract,
      protocol: http,
      factory: () => ({
        get() {
          return { kind: 'http-result', variant: 'ok', body: 'first' } as const
        },
      }),
    })
    const SecondController = implementation({
      name: 'SecondController',
      contract: SecondContract,
      protocol: http,
      factory: () => ({
        get() {
          return { kind: 'http-result', variant: 'ok', body: 'second' } as const
        },
      }),
    })
    const FirstModule = defineModule(() => ({
      implementations: [FirstController],
    }))
    const SecondModule = defineModule(() => ({
      implementations: [SecondController],
    }))

    const result = compileApplication([FirstModule(), SecondModule()])
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'LUTRE_PROTOCOL_001',
        message: expect.stringContaining('http:GET:/graph/{}'),
      }),
    )
    expect(() => assertValidCompilation(result)).toThrow()
  })
})
