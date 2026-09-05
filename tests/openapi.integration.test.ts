import { generateOpenApi } from '@loutrejs/loutre/openapi'
import { defineApplication } from '@loutrejs/loutre'
import { contract, defineModule, implementation } from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { createUsersApplication } from '../integrations/http-crud/src/index.js'
import { z } from 'zod'
describe('OpenAPI generation', () => {
  it('projects executable HTTP contracts to OpenAPI 3.2', () => {
    const document = generateOpenApi(createUsersApplication(), {
      info: {
        title: 'Users API',
        version: '1.0.0',
      },
    })
    expect(document.openapi).toBe('3.2.0')
    expect(document.jsonSchemaDialect).toBe(
      'https://json-schema.org/draft/2020-12/schema',
    )
    const getUser = document.paths['/users/{id}']?.get as
      | Record<string, any>
      | undefined
    expect(getUser?.operationId).toBeUndefined()
    expect(getUser?.parameters).toEqual([
      expect.objectContaining({
        name: 'id',
        in: 'path',
        required: true,
        schema: expect.objectContaining({
          $ref: expect.stringContaining('RequestParam_id_Input'),
        }),
      }),
    ])
    expect(getUser?.responses['200']).toEqual(
      expect.objectContaining({
        description: 'found',
        content: {
          'application/json': {
            schema: expect.objectContaining({
              $ref: expect.stringContaining('Response_found_Output'),
            }),
          },
        },
      }),
    )
    const createUser = document.paths['/users']?.post as
      | Record<string, any>
      | undefined
    expect(createUser?.operationId).toBeUndefined()
    expect(createUser?.requestBody).toEqual({
      content: {
        'application/json': {
          schema: expect.objectContaining({
            $ref: expect.stringContaining('RequestBody_Input'),
          }),
        },
      },
    })
    expect(Object.keys(document.components?.schemas ?? {})).toEqual(
      expect.arrayContaining([
        expect.stringContaining('GET_users_id_get_RequestParam_id_Input'),
        expect.stringContaining('GET_users_id_get_Response_found_Output'),
        expect.stringContaining('POST_users_create_RequestBody_Input'),
      ]),
    )
  })
  it('operationIdをOpenAPI生成側で明示的に決められる', () => {
    const document = generateOpenApi(createUsersApplication(), {
      info: { title: 'Users API', version: '1.0.0' },
      operationId: ({ method, procedure }) =>
        `${method.toLowerCase()}.${procedure}`,
    })

    expect(document.paths['/users/{id}']?.get).toEqual(
      expect.objectContaining({ operationId: 'get.get' }),
    )
    expect(document.paths['/users']?.post).toEqual(
      expect.objectContaining({ operationId: 'post.create' }),
    )
  })
  it('uses querystring, header parameters, response oneOf and additionalOperations', () => {
    const Input = z.object({
      q: z.string(),
      page: z.coerce.number().optional(),
    })
    const Headers = z.object({ 'x-tenant-id': z.string() })
    const Success = z.object({ ok: z.literal(true) })
    const FailureA = z.object({ code: z.literal('A') })
    const FailureB = z.object({ code: z.literal('B') })
    const ApiContract = contract([
      http({
        copy: {
          method: 'COPY',
          path: '/search',
          summary: 'Copy search result',
          tags: ['Search'],
          request: {
            query: Input,
            headers: Headers,
          },
          responses: {
            ok: { status: 200, description: 'Success', body: Success },
            failedA: { status: 400, body: FailureA },
            failedB: { status: 400, body: FailureB },
          },
          pipeline: [validate.query, validate.headers, http.controller],
        },
      }),
    ])
    const ApiImplementation = implementation({
      name: 'ApiImplementation',
      contract: ApiContract,
      protocol: http,

      factory: () => ({
        copy(ctx) {
          return ctx.response.ok({ body: { ok: true } })
        },
      }),
    })
    const ApiModule = defineModule(() => ({
      implementations: [ApiImplementation],
    }))
    const application = defineApplication({ modules: [ApiModule()] })
    const document = generateOpenApi(application, {
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
    const Contract = contract([
      http({
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
          pipeline: [validate.headers, validate.body, http.controller],
        },
      }),
    ])
    const Implementation = implementation({
      name: 'RepresentationImplementation',
      contract: Contract,
      protocol: http,
      factory: () => ({
        create(ctx) {
          return ctx.response.ok({ body: { ok: true } })
        },
      }),
    })
    const Module = defineModule(() => ({ implementations: [Implementation] }))
    const application = defineApplication({ modules: [Module()] })

    const document = generateOpenApi(application, {
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

  it('Content-Typeを有限集合へ解決できない場合はOpenAPI生成を失敗させる', () => {
    const Contract = contract([
      http({
        create: {
          method: 'POST',
          path: '/dynamic-content-type',
          request: {
            headers: z.object({ 'content-type': z.string() }),
            body: z.object({ value: z.string() }),
          },
          responses: {
            ok: { status: 200, body: z.object({ ok: z.boolean() }) },
          },
          pipeline: [validate.headers, validate.body, http.controller],
        },
      }),
    ])
    const Implementation = implementation({
      name: 'DynamicContentTypeImplementation',
      contract: Contract,
      protocol: http,
      factory: () => ({
        create(ctx) {
          return ctx.response.ok({ body: { ok: true } })
        },
      }),
    })
    const Module = defineModule(() => ({ implementations: [Implementation] }))
    const application = defineApplication({ modules: [Module()] })

    expect(() =>
      generateOpenApi(application, {
        info: { title: 'Dynamic API', version: '1.0.0' },
      }),
    ).toThrow('LUTRE_OPENAPI_CONTENT_TYPE_002')
  })
})
