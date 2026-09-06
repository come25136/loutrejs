import { generateOpenApi } from '@loutrejs/loutre/http/openapi'
import { defineApplication, defineModule } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'

function applicationFor<TContract extends ReturnType<typeof http.contract>>(
  contract: TContract,
  factory: Parameters<typeof http.implementation<TContract>>[0]['factory'],
) {
  const execution = http.implementation({ contract, factory })
  const Module = defineModule(() => ({ executions: [execution] }))
  return defineApplication({ modules: [Module()] })
}

describe('OpenAPI generation', () => {
  it('projects compiled HTTP executions to OpenAPI 3.2', () => {
    const contract = http.contract({
      get: {
        method: 'GET',
        path: '/users/{id}',
        request: { params: { id: z.string() } },
        responses: {
          found: {
            status: 200,
            description: 'found',
            body: z.object({ id: z.string() }),
          },
        },
      },
      create: {
        method: 'POST',
        path: '/users',
        request: {
          headers: z.object({ 'content-type': z.literal('application/json') }),
          body: z.object({ name: z.string() }),
        },
        responses: {
          created: { status: 201, body: z.object({ id: z.string() }) },
        },
      },
    })
    const application = applicationFor(contract, () => ({
      get: (ctx) => ctx.response.found({ body: { id: ctx.input.params.id } }),
      create: (ctx) =>
        ctx.response.created({ body: { id: ctx.input.body.name } }),
    }))

    const document = generateOpenApi(application.model, {
      info: { title: 'Users API', version: '1.0.0' },
    })
    expect(document.openapi).toBe('3.2.0')
    const getUser = document.paths['/users/{id}']?.get as Record<string, any>
    expect(getUser.parameters).toEqual([
      expect.objectContaining({
        name: 'id',
        in: 'path',
        required: true,
        schema: expect.objectContaining({
          $ref: expect.stringContaining('RequestParam_id_Input'),
        }),
      }),
    ])
    expect(getUser.responses['200']).toEqual(
      expect.objectContaining({ description: 'found' }),
    )
    const createUser = document.paths['/users']?.post as Record<string, any>
    expect(createUser.requestBody).toEqual({
      content: {
        'application/json': {
          schema: expect.objectContaining({
            $ref: expect.stringContaining('RequestBody_Input'),
          }),
        },
      },
    })
  })

  it('operationIdをOpenAPI生成側で明示的に決められる', () => {
    const contract = http.contract({
      get: {
        method: 'GET',
        path: '/users/{id}',
        request: { params: { id: z.string() } },
        responses: { ok: { status: 200, body: z.string() } },
      },
    })
    const application = applicationFor(contract, () => ({
      get: (ctx) => ctx.response.ok({ body: ctx.input.params.id }),
    }))
    const document = generateOpenApi(application.model, {
      info: { title: 'Users API', version: '1.0.0' },
      operationId: ({ method, procedure }) =>
        `${method.toLowerCase()}.${procedure}`,
    })
    expect(document.paths['/users/{id}']?.get).toEqual(
      expect.objectContaining({ operationId: 'get.get' }),
    )
  })

  it('uses querystring, header parameters, response oneOf and additionalOperations', () => {
    const contract = http.contract({
      copy: {
        method: 'COPY',
        path: '/search',
        summary: 'Copy search result',
        tags: ['Search'],
        request: {
          query: z.object({ q: z.string() }),
          headers: z.object({ 'x-tenant-id': z.string() }),
        },
        responses: {
          ok: { status: 200, body: z.object({ ok: z.literal(true) }) },
          failedA: { status: 400, body: z.object({ code: z.literal('A') }) },
          failedB: { status: 400, body: z.object({ code: z.literal('B') }) },
        },
      },
    })
    const application = applicationFor(contract, () => ({
      copy: (ctx) => ctx.response.ok({ body: { ok: true } }),
    }))
    const document = generateOpenApi(application.model, {
      info: { title: 'Search API', version: '1.0.0' },
    })
    const operation = (
      document.paths['/search']?.additionalOperations as
        | Record<string, Record<string, any>>
        | undefined
    )?.COPY
    expect(operation?.summary).toBe('Copy search result')
    expect(operation?.tags).toEqual(['Search'])
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ in: 'querystring' }),
        expect.objectContaining({
          in: 'header',
          name: 'x-tenant-id',
          required: true,
        }),
      ]),
    )
    expect(
      operation?.responses['400'].content['application/json'].schema.oneOf,
    ).toHaveLength(2)
  })

  it('Content-Typeの有限集合をrequestBody contentへ投影する', () => {
    const contract = http.contract({
      create: {
        method: 'POST',
        path: '/representations',
        request: {
          headers: z.object({
            'content-type': z.union([
              z.literal('application/json'),
              z.literal('text/plain'),
            ]),
            'x-request-id': z.string(),
          }),
          body: z.union([z.object({ value: z.string() }), z.string()]),
        },
        responses: {
          ok: { status: 200, body: z.object({ ok: z.boolean() }) },
        },
      },
    })
    const application = applicationFor(contract, () => ({
      create: (ctx) => ctx.response.ok({ body: { ok: true } }),
    }))
    const document = generateOpenApi(application.model, {
      info: { title: 'Representations API', version: '1.0.0' },
    })
    const operation = document.paths['/representations']?.post as
      | Record<string, any>
      | undefined
    expect(Object.keys(operation?.requestBody.content ?? {})).toEqual([
      'application/json',
      'text/plain',
    ])
    expect(operation?.parameters).toEqual([
      expect.objectContaining({ name: 'x-request-id', in: 'header' }),
    ])
  })

  it('response headerのschemaとdefaultsを単一headersから投影する', () => {
    const contract = http.contract({
      get: {
        method: 'GET',
        path: '/headers',
        responses: {
          ok: {
            status: 200,
            body: z.string(),
            headers: {
              schema: z.object({ etag: z.string() }),
              defaults: {
                'cache-control': 'no-store',
                'set-cookie': ['first=one', 'second=two'],
              },
            },
          },
        },
      },
    })
    const application = applicationFor(contract, () => ({
      get: (ctx) => ctx.response.ok({ body: 'ok', headers: { etag: 'v1' } }),
    }))
    const document = generateOpenApi(application.model, {
      info: { title: 'Response Headers API', version: '1.0.0' },
    })
    const operation = document.paths['/headers']?.get as Record<string, any>
    const response = operation.responses['200']
    expect(response.headers.etag).toEqual({ schema: { type: 'string' } })
    expect(response.headers['cache-control']).toEqual({
      schema: { type: 'string', const: 'no-store' },
    })
    expect(response.headers['set-cookie']).toEqual({
      schema: {
        type: 'array',
        items: { type: 'string' },
        const: ['first=one', 'second=two'],
      },
    })
  })

  it('Content-Typeを有限集合へ解決できない場合はOpenAPI生成を失敗させる', () => {
    const schema =
      z.string() as unknown as typeof z.string extends () => infer T ? T : never
    const contract = http.contract({
      create: {
        method: 'POST',
        path: '/dynamic-content-type',
        request: {
          headers: z.object({ 'content-type': schema }),
          body: z.object({ value: z.string() }),
        },
        responses: { ok: { status: 200, body: z.object({ ok: z.boolean() }) } },
      },
    } as any)
    const application = applicationFor(contract, () => ({
      create: (ctx: any) => ctx.response.ok({ body: { ok: true } }),
    }))
    expect(() =>
      generateOpenApi(application.model, {
        info: { title: 'Dynamic API', version: '1.0.0' },
      }),
    ).toThrow('LUTRE_OPENAPI_CONTENT_TYPE_002')
  })
})
