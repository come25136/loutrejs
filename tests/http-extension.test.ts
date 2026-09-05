import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import {
  bootstrapApplication,
  type ApplicationExtensions,
  defineApplication,
  defineModule,
} from '@loutrejs/loutre'
import {
  bindHttpServer,
  http,
  type HttpExecutionContext,
  type HttpHostApi,
} from '@loutrejs/http'

describe('HTTP Execution Extension', () => {
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
})
