import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  bootstrapApplication,
  defineApplication,
  defineError,
  defineModule,
} from '@loutrejs/loutre'
import { generateOpenApi } from '@loutrejs/loutre/http/openapi'
import {
  bindHttpServer,
  createHttpClient,
  fetchHttpTransport,
  http,
  type HttpClientTransportRequest,
} from '@loutrejs/loutre/http'

async function createApplication<
  const TContract extends ReturnType<typeof http.contract>,
>(
  contract: TContract,
  factory: Parameters<typeof http.implementation<TContract>>[0]['factory'],
) {
  const implementation = http.implementation({ contract, factory })
  const Module = defineModule(() => ({ executions: [implementation] }))
  const definition = defineApplication({ modules: [Module()] })
  const application = await bootstrapApplication({
    application: definition,
    capabilities: [bindHttpServer({ runtime: 'test' })],
  })
  return { application, definition }
}

describe('HTTP Execution Extension public API surface', () => {
  it('typed clientを新HttpContractから生成する', async () => {
    const contract = http.contract({
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
      },
    })
    let sent: HttpClientTransportRequest | undefined
    const client = createHttpClient(contract, async (request) => {
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

  it('fetch transportのJSON encodeを維持する', async () => {
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
    await expect(captured?.json()).resolves.toEqual({ name: 'loutre' })
  })

  it('route/response metadataをOpenAPIへ投影する', async () => {
    const contract = http.contract({
      getUser: {
        method: 'GET',
        path: '/users/{id}',
        summary: 'Get user',
        description: 'Returns one user',
        tags: ['Users'],
        deprecated: false,
        request: { params: { id: z.string() } },
        responses: {
          ok: {
            status: 200,
            description: 'User found',
            body: z.object({ id: z.string() }),
          },
        },
      },
    })
    const { application, definition } = await createApplication(
      contract,
      () => ({
        getUser: (ctx) =>
          ctx.response.ok({ body: { id: ctx.input.params.id } }),
      }),
    )
    try {
      const document = generateOpenApi(definition.model, {
        info: { title: 'fixture', version: '1.0.0' },
      })
      const operation = document.paths['/users/{id}']?.get as
        | Record<string, unknown>
        | undefined
      expect(operation).toMatchObject({
        summary: 'Get user',
        description: 'Returns one user',
        tags: ['Users'],
        deprecated: false,
        responses: {
          '200': { description: 'User found' },
        },
      })
    } finally {
      await application.close()
    }
  })

  it('Domain Errorを宣言responseへmappingする', async () => {
    const UserNotFound = defineError({
      code: 'USER_NOT_FOUND',
      data: z.object({ userId: z.string() }),
    })
    const contract = http.contract({
      get: {
        method: 'GET',
        path: '/missing',
        responses: {
          notFound: {
            status: 404,
            body: z.object({ userId: z.string() }),
            headers: z.object({ 'x-error-code': z.string() }),
            error: http.error(UserNotFound, (error) => ({
              body: error.data,
              headers: { 'x-error-code': error.code },
            })),
          },
        },
      },
    })
    const { application } = await createApplication(contract, () => ({
      get(): never {
        throw UserNotFound({ userId: 'missing-user' })
      },
    }))
    try {
      const response = await application.http.fetch(
        new Request('https://fixture.test/missing'),
      )
      expect(response.status).toBe(404)
      expect(response.headers.get('x-error-code')).toBe('USER_NOT_FOUND')
      await expect(response.json()).resolves.toEqual({ userId: 'missing-user' })
    } finally {
      await application.close()
    }
  })

  it('server-stream responseをSSEとして返しstream完了までExecutionを維持する', async () => {
    const contract = http.contract({
      events: {
        method: 'GET',
        path: '/events',
        interaction: 'server-stream',
        responses: {
          ok: {
            status: 200,
            description: 'Event stream',
            stream: 'server',
            body: z.object({ sequence: z.number() }),
          },
        },
      },
    })
    const { application, definition } = await createApplication(
      contract,
      () => ({
        events: (ctx) =>
          ctx.response.ok({
            body: (async function* () {
              yield { sequence: 1 }
              yield { sequence: 2 }
            })(),
          }),
      }),
    )
    try {
      const response = await application.http.fetch(
        new Request('https://fixture.test/events'),
      )
      expect(response.headers.get('content-type')).toBe(
        'text/event-stream; charset=utf-8',
      )
      expect(response.headers.get('cache-control')).toBe('no-cache')
      expect(await response.text()).toBe(
        'data:{"sequence":1}\n\ndata:{"sequence":2}\n\n',
      )

      const client = createHttpClient(
        contract,
        fetchHttpTransport({
          baseUrl: 'https://fixture.test',
          fetch: (input, init) =>
            application.http.fetch(new Request(input, init)),
        }),
      )
      const clientResponse = await client.events()
      const events: { sequence: number }[] = []
      for await (const event of clientResponse.body) events.push(event)
      expect(events).toEqual([{ sequence: 1 }, { sequence: 2 }])

      const document = generateOpenApi(definition.model, {
        info: { title: 'fixture', version: '1.0.0' },
      })
      const operation = document.paths['/events']?.get as
        | Record<string, unknown>
        | undefined
      expect(operation).toMatchObject({
        responses: {
          '200': {
            description: 'Event stream',
            content: {
              'text/event-stream': {
                itemSchema: expect.objectContaining({ type: 'object' }),
              },
            },
          },
        },
      })
    } finally {
      await application.close()
    }
  })

  it('server-streamのitem validation失敗時にsource iteratorを終了する', async () => {
    let finalized = false
    const contract = http.contract({
      events: {
        method: 'GET',
        path: '/events',
        interaction: 'server-stream',
        responses: {
          ok: {
            status: 200,
            stream: 'server',
            body: z.object({ sequence: z.number() }),
          },
        },
      },
    })
    const { application } = await createApplication(contract, () => ({
      events: (ctx) =>
        ctx.response.ok({
          body: (async function* () {
            try {
              yield { sequence: 'invalid' } as never
            } finally {
              finalized = true
            }
          })(),
        }),
    }))
    try {
      const response = await application.http.fetch(
        new Request('https://fixture.test/events'),
      )

      await expect(response.text()).rejects.toThrow()
      expect(finalized).toBe(true)
    } finally {
      await application.close()
    }
  })

  it('shutdown時に未完了server-streamを停止してExecutionを完了する', async () => {
    const events: string[] = []
    const contract = http.contract({
      events: {
        method: 'GET',
        path: '/events',
        interaction: 'server-stream',
        responses: {
          ok: {
            status: 200,
            stream: 'server',
            body: z.object({ sequence: z.number() }),
          },
        },
      },
    })
    const implementation = http.implementation({
      contract,
      factory: () => ({
        events: (ctx) =>
          ctx.response.ok({
            body: (async function* () {
              try {
                let sequence = 0
                while (true) yield { sequence: sequence++ }
              } finally {
                events.push('stream.finalized')
              }
            })(),
          }),
      }),
    })
    class Resource {
      onModuleDestroy() {
        events.push('provider.destroy')
      }
    }
    const Module = defineModule(() => ({
      providers: [Resource],
      executions: [implementation],
    }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [bindHttpServer({ runtime: 'test' })],
    })
    const response = await application.http.fetch(
      new Request('https://fixture.test/events'),
    )
    const reader = response.body!.getReader()
    const readerClosed = reader.closed.catch(() => undefined)
    await expect(reader.read()).resolves.toMatchObject({ done: false })

    await expect(
      Promise.race([
        application.close(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('HTTP server-stream drain timed out')),
            250,
          ),
        ),
      ]),
    ).resolves.toBeUndefined()
    await readerClosed
    expect(events).toEqual(['stream.finalized', 'provider.destroy'])
  })
})
