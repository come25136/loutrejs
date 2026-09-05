import { contract } from '@loutrejs/loutre'
import {
  HttpClientResponseError,
  createHttpClient,
  fetchHttpTransport,
  http,
  type HttpClientTransportRequest,
} from '@loutrejs/loutre/http'
import { z } from 'zod'
describe('HTTP typed client', () => {
  it('Contractに準拠したHTTP requestとresponseを扱える', async () => {
    const UsersContract = contract([
      http({
        update: {
          method: 'PUT',
          path: '/users/{id}',
          request: {
            params: { id: z.string() },
            query: z.object({ notify: z.boolean() }),
            headers: z.object({
              'content-type': z.literal('application/json'),
              'x-request-id': z.string(),
            }),
            body: z.object({ name: z.string() }),
          },
          responses: {
            updated: {
              status: 200,
              body: z.object({
                id: z.string(),
                name: z.string().transform((value) => value.toUpperCase()),
              }),
              headers: z.object({ 'x-version': z.string() }),
            },
          },
          pipeline: [http.controller],
        },
      }),
    ])
    let sent: HttpClientTransportRequest | undefined
    const client = createHttpClient(UsersContract, async (request) => {
      sent = request
      return {
        status: 200,
        body: { id: '42', name: 'Ada' },
        headers: { 'x-version': '7' },
      }
    })
    const response = await client.update({
      params: { id: '42' },
      query: { notify: true },
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-1',
      },
      body: { name: 'Ada' },
    })
    expect(sent).toEqual({
      method: 'PUT',
      path: '/users/42',
      query: { notify: true },
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-1',
      },
      body: { name: 'Ada' },
    })
    expect(response).toEqual({
      status: 200,
      body: { id: '42', name: 'ADA' },
      headers: { 'x-version': '7' },
    })
  })
  it('fetch transportはContent-Type headerからJSON bodyをencodeする', async () => {
    let captured: Request | undefined
    const transport = fetchHttpTransport({
      baseUrl: 'https://fixture.test',
      fetch: async (input, init) => {
        captured = new Request(input, init)
        return new Response(null, { status: 204 })
      },
    })

    await transport({
      method: 'POST',
      path: '/json',
      headers: { 'content-type': 'application/json' },
      body: { name: 'loutre' },
    })

    expect(captured?.headers.get('content-type')).toBe('application/json')
    expect(await captured?.json()).toEqual({ name: 'loutre' })
  })

  it('fetch transportはmultipartのboundaryをFetchへ委ねる', async () => {
    let captured: Request | undefined
    const transport = fetchHttpTransport({
      baseUrl: 'https://fixture.test',
      fetch: async (input, init) => {
        captured = new Request(input, init)
        return new Response(null, { status: 204 })
      },
    })
    const body = new FormData()
    body.set('name', 'loutre')

    await transport({
      method: 'POST',
      path: '/multipart',
      headers: { 'content-type': 'multipart/form-data' },
      body,
    })

    expect(captured?.headers.get('content-type')).toMatch(
      /^multipart\/form-data; boundary=/,
    )
    expect((await captured?.formData())?.get('name')).toBe('loutre')
  })

  it('Contractにないstatusをtyped client境界で拒否する', async () => {
    const Contract = contract([
      http({
        get: {
          method: 'GET',
          path: '/',
          responses: {
            ok: { status: 200, body: z.string() },
          },
          pipeline: [http.controller],
        },
      }),
    ])
    const client = createHttpClient(Contract, async () => ({
      status: 500,
      body: 'unexpected',
    }))
    await expect(client.get()).rejects.toMatchObject({
      name: 'HttpClientResponseError',
      status: 500,
      method: 'GET',
      path: '/',
      procedure: 'get',
    } satisfies Partial<HttpClientResponseError>)
  })
})
