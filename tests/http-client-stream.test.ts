import {
  createHttpClient,
  fetchHttpTransport,
  http,
} from '@loutrejs/loutre/http'
import { z } from 'zod'
describe('HTTP typed client server stream', () => {
  it('server-stream responseの各itemをContractのoutputとして取得できる', async () => {
    const EventsContract = http.contract({
      subscribe: {
        method: 'GET',
        path: '/events',
        responses: {
          events: {
            status: 200,
            stream: 'server',
            body: z.object({
              sequence: z.string().transform(Number),
            }),
          },
        },
        pipeline: [http.controller],
      },
    })
    const encoder = new TextEncoder()
    const client = createHttpClient(
      EventsContract,
      fetchHttpTransport({
        baseUrl: 'https://example.com',
        fetch: async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode('data:{"sequence":"1"}\n\n'))
                controller.enqueue(encoder.encode('data:{"sequence":"2"}\n\n'))
                controller.close()
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'text/event-stream; charset=utf-8' },
            },
          ),
      }),
    )
    const response = await client.subscribe()
    const items = []
    for await (const item of response.body) items.push(item)
    expect(items).toEqual([{ sequence: 1 }, { sequence: 2 }])
  })
  it('Contractに違反するserver-stream itemをclient境界で拒否する', async () => {
    const Contract = http.contract({
      stream: {
        method: 'GET',
        path: '/stream',
        responses: {
          ok: {
            status: 200,
            stream: 'server',
            body: z.number(),
          },
        },
        pipeline: [http.controller],
      },
    })
    const client = createHttpClient(Contract, async () => ({
      status: 200,
      body: (async function* () {
        yield 'invalid'
      })(),
    }))
    const response = await client.stream()
    const consume = async () => {
      for await (const item of response.body) void item
    }
    await expect(consume()).rejects.toMatchObject({
      name: 'HttpClientResponseError',
      status: 200,
    })
  })
})
