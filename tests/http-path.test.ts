import { createTestApplication } from './helpers/application.js'
import { contract, defineModule, implementation } from '@loutrejs/loutre'
import {
  assertValidCompilation,
  compileApplication,
} from '@loutrejs/loutre/graph'
import { http, validate } from '@loutrejs/loutre/http'
import { validateHttpParamsSchemas } from '../packages/loutre/src/http/params.js'
import { z } from 'zod'
import { silentLogger } from './helpers/silent-logger.js'
const Result = z.object({ route: z.string(), value: z.unknown() })
function createRoutingApplication() {
  const Contract = contract([
    http({
      raw: {
        method: 'GET',
        path: '/raw/{id}',
        responses: { ok: { status: 200, body: Result } },
        pipeline: [http.controller],
      },
      declaredOnly: {
        method: 'GET',
        path: '/declared/{id}',
        request: { params: { id: z.coerce.number() } },
        responses: { ok: { status: 200, body: Result } },
        pipeline: [http.controller],
      },
      multiple: {
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
      },
      dynamic: {
        method: 'GET',
        path: '/priority/{id}',
        responses: { ok: { status: 200, body: Result } },
        pipeline: [http.controller],
      },
      static: {
        method: 'GET',
        path: '/priority/me',
        responses: { ok: { status: 200, body: Result } },
        pipeline: [http.controller],
      },
      lessSpecific: {
        method: 'GET',
        path: '/specific/{x}/c',
        responses: { ok: { status: 200, body: Result } },
        pipeline: [http.controller],
      },
      moreSpecific: {
        method: 'GET',
        path: '/specific/b/{y}',
        responses: { ok: { status: 200, body: Result } },
        pipeline: [http.controller],
      },
      getMethod: {
        method: 'GET',
        path: '/method/{id}',
        responses: { ok: { status: 200, body: Result } },
        pipeline: [http.controller],
      },
      postMethod: {
        method: 'POST',
        path: '/method/{id}',
        responses: { ok: { status: 200, body: Result } },
        pipeline: [http.controller],
      },
    }),
  ])
  const Implementation = implementation({
    name: 'Implementation',
    contract: Contract,
    protocol: http,

    factory: () => ({
      raw(ctx) {
        return ctx.response.ok({
          body: { route: 'raw', value: ctx.input.params.id },
        })
      },
      declaredOnly(ctx) {
        return ctx.response.ok({
          body: { route: 'declared', value: ctx.input.params.id },
        })
      },
      multiple(ctx) {
        return ctx.response.ok({
          body: { route: 'multiple', value: ctx.input.params },
        })
      },
      dynamic(ctx) {
        return ctx.response.ok({
          body: { route: 'dynamic', value: ctx.input.params.id },
        })
      },
      static(ctx) {
        return ctx.response.ok({ body: { route: 'static', value: null } })
      },
      lessSpecific(ctx) {
        return ctx.response.ok({
          body: { route: 'less', value: ctx.input.params.x },
        })
      },
      moreSpecific(ctx) {
        return ctx.response.ok({
          body: { route: 'more', value: ctx.input.params.y },
        })
      },
      getMethod(ctx) {
        return ctx.response.ok({
          body: { route: 'get', value: ctx.input.params.id },
        })
      },
      postMethod(ctx) {
        return ctx.response.ok({
          body: { route: 'post', value: ctx.input.params.id },
        })
      },
    }),
  })
  const Module = defineModule(() => ({
    implementations: [Implementation],
  }))
  return createTestApplication({
    modules: [Module()],
    logger: silentLogger,
  })
}
describe('HTTP pathとroute identity', () => {
  it('raw paramsのdecodeとproperty-wise transformを行う', async () => {
    const application = createRoutingApplication()
    const raw = await application.fetch(
      new Request('http://fixture.test/raw/hello%20world'),
    )
    expect(await raw.json()).toEqual({ route: 'raw', value: 'hello world' })
    const declaredOnly = await application.fetch(
      new Request('http://fixture.test/declared/123'),
    )
    expect(await declaredOnly.json()).toEqual({
      route: 'declared',
      value: '123',
    })
    const multiple = await application.fetch(
      new Request('http://fixture.test/users/123/posts/456'),
    )
    expect(await multiple.json()).toEqual({
      route: 'multiple',
      value: { userId: 123, postId: '456' },
    })
    const invalidEncoding = await application.fetch(
      new Request('http://fixture.test/raw/%E0%A4%A'),
    )
    expect(invalidEncoding.status).toBe(400)
  })
  it('static優先度と左からのspecificityが登録順に依存しない', async () => {
    const application = createRoutingApplication()
    const staticResponse = await application.fetch(
      new Request('http://fixture.test/priority/me'),
    )
    expect(await staticResponse.json()).toEqual({
      route: 'static',
      value: null,
    })
    const deeperResponse = await application.fetch(
      new Request('http://fixture.test/specific/b/c'),
    )
    expect(await deeperResponse.json()).toEqual({ route: 'more', value: 'c' })
    const ReverseContract = contract([
      http({
        static: {
          method: 'GET',
          path: '/reverse/me',
          responses: { ok: { status: 200, body: z.string() } },
          pipeline: [http.controller],
        },
        dynamic: {
          method: 'GET',
          path: '/reverse/{id}',
          responses: { ok: { status: 200, body: z.string() } },
          pipeline: [http.controller],
        },
      }),
    ])
    const ReverseImplementation = implementation({
      name: 'ReverseImplementation',
      contract: ReverseContract,
      protocol: http,

      factory: () => ({
        static(ctx) {
          return ctx.response.ok({ body: 'static' })
        },
        dynamic(ctx) {
          return ctx.response.ok({ body: `dynamic:${ctx.input.params.id}` })
        },
      }),
    })
    const ReverseModule = defineModule(() => ({
      implementations: [ReverseImplementation],
    }))
    const reverseApplication = createTestApplication({
      modules: [ReverseModule()],
      logger: silentLogger,
    })
    const reverseResponse = await reverseApplication.fetch(
      new Request('http://fixture.test/reverse/me'),
    )
    expect(await reverseResponse.json()).toBe('static')
  })
  it('methodが異なる同一pathを別routeとしてdispatchする', async () => {
    const application = createRoutingApplication()
    const getResponse = await application.fetch(
      new Request('http://fixture.test/method/1'),
    )
    const postResponse = await application.fetch(
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
        http.route({
          method: 'GET',
          path,
          responses: { ok: { status: 200, body: z.string() } },
          pipeline: [http.controller],
        } as never),
      ).toThrow()
    }
    expect(() =>
      http.route({
        method: 'GET',
        path: '/users/{id}',
        request: { params: { userId: z.string() } },
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [validate.params, http.controller],
      } as never),
    ).toThrow(/must match/)
    expect(() =>
      http.route({
        method: 'GET',
        path: '/users/{id}',
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [validate.params, http.controller],
      } as never),
    ).toThrow(/requires request.params/)
  })
  it('method uppercase・param名除外・rootをdispatchKeyへ反映する', () => {
    const first = http.route({
      method: 'get',
      path: '/users/{id}/posts/{postId}',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    })
    const second = http.route({
      method: 'GET',
      path: '/users/{userId}/posts/{id}',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    })
    const root = http.route({
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
    const duplicateHttp = http({
      first: {
        method: 'GET',
        path: '/duplicate/{id}',
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [http.controller],
      },
      second: {
        method: 'get',
        path: '/duplicate/{userId}',
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [http.controller],
      },
    })
    expect(() => (contract as any)([duplicateHttp])).toThrow(
      /Duplicate protocol dispatch key "http:GET:\/duplicate\/\{\}"/,
    )
  })
  it('別Contract間の重複をGraph diagnosticにする', () => {
    const FirstContract = contract([
      http({
        get: {
          method: 'GET',
          path: '/graph/{id}',
          responses: { ok: { status: 200, body: z.string() } },
          pipeline: [http.controller],
        },
      }),
    ])
    const SecondContract = contract([
      http({
        get: {
          method: 'get',
          path: '/graph/{userId}',
          responses: { ok: { status: 200, body: z.string() } },
          pipeline: [http.controller],
        },
      }),
    ])
    const FirstController = implementation({
      name: 'FirstController',
      contract: FirstContract,
      protocol: http,

      factory: () => ({
        get() {
          return { kind: 'http-result', response: 'ok', body: 'first' } as const
        },
      }),
    })
    const SecondController = implementation({
      name: 'SecondController',
      contract: SecondContract,
      protocol: http,

      factory: () => ({
        get() {
          return {
            kind: 'http-result',
            response: 'ok',
            body: 'second',
          } as const
        },
      }),
    })
    const FirstModule = defineModule(() => ({
      implementations: [FirstController],
    }))
    const SecondModule = defineModule(() => ({
      implementations: [SecondController],
    }))
    const result = compileApplication({
      modules: [FirstModule(), SecondModule()],
    })
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'LUTRE_PROTOCOL_001',
        message: expect.stringContaining('http:GET:/graph/{}'),
      }),
    )
    expect(() => assertValidCompilation(result)).toThrow()
  })
})
