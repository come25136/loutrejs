import { contract, procedure } from '@loutrejs/loutre'
import {
  HttpClientResponseError,
  createHttpClient,
  http,
  type HttpClientTransportRequest,
} from '@loutrejs/loutre/http'
import { z } from 'zod'

describe('HTTP typed client', () => {
  it('Contractに準拠したHTTP requestとresponseを扱える', async () => {
    const UsersContract = contract(
      {
        update: procedure({
          protocols: {
            http: http({
              method: 'PUT',
              path: '/users/{id}',
              request: {
                params: { id: z.string() },
                query: z.object({ notify: z.boolean() }),
                headers: z.object({ 'x-request-id': z.string() }),
                body: {
                  contentType: 'application/json',
                  schema: z.object({ name: z.string() }),
                },
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
            }),
          },
        }),
      },
      { name: 'Users' },
    )
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
      headers: { 'x-request-id': 'req-1' },
      body: { name: 'Ada' },
    })

    expect(sent).toEqual({
      method: 'PUT',
      path: '/users/42',
      query: { notify: true },
      headers: { 'x-request-id': 'req-1' },
      body: { name: 'Ada' },
      contentType: 'application/json',
    })
    expect(response).toEqual({
      status: 200,
      body: { id: '42', name: 'ADA' },
      headers: { 'x-version': '7' },
    })
  })

  it('Contractにないstatusをtyped client境界で拒否する', async () => {
    const Contract = contract(
      {
        get: procedure({
          protocols: {
            http: http({
              method: 'GET',
              path: '/',
              responses: {
                ok: { status: 200, body: z.string() },
              },
              pipeline: [http.controller],
            }),
          },
        }),
      },
      { name: 'Example' },
    )
    const client = createHttpClient(Contract, async () => ({
      status: 500,
      body: 'unexpected',
    }))

    await expect(client.get()).rejects.toMatchObject({
      name: 'HttpClientResponseError',
      status: 500,
      contract: 'Example',
      procedure: 'get',
    } satisfies Partial<HttpClientResponseError>)
  })
})
