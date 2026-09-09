import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  bootstrapApplication,
  defineApplication,
  defineError,
  defineModule,
  inject,
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

  it('fetch transportでbodyを持たない200応答をundefinedとして扱う', async () => {
    const contract = http.contract({
      health: {
        method: 'GET',
        path: '/health',
        responses: { ok: { status: 200 } },
      },
    })
    const client = createHttpClient(
      contract,
      fetchHttpTransport({
        baseUrl: 'https://fixture.test',
        fetch: async () => new Response(null, { status: 200 }),
      }),
    )

    await expect(client.health()).resolves.toEqual({
      status: 200,
      body: undefined,
      headers: {},
    })
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

  it('chunk境界で分割されたSSEのCRLFを1つの改行としてdecodeする', async () => {
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
    const encoder = new TextEncoder()
    const chunks = ['data:{"sequence":\r', '\ndata:1}\r', '\n\r\n'].map(
      (chunk) => encoder.encode(chunk),
    )
    const client = createHttpClient(
      contract,
      fetchHttpTransport({
        baseUrl: 'https://fixture.test',
        fetch: async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                for (const chunk of chunks) controller.enqueue(chunk)
                controller.close()
              },
            }),
            { headers: { 'content-type': 'text/event-stream' } },
          ),
      }),
    )

    const response = await client.events()
    const events: { sequence: number }[] = []
    for await (const event of response.body) events.push(event)

    expect(events).toEqual([{ sequence: 1 }])
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

  it('handler待機中に始まったshutdownは後から移譲されたserver-streamも停止する', async () => {
    let notifyHandlerStarted!: () => void
    const handlerStarted = new Promise<void>((resolve) => {
      notifyHandlerStarted = resolve
    })
    let resumeHandler!: () => void
    const handlerResume = new Promise<void>((resolve) => {
      resumeHandler = resolve
    })
    const contract = http.contract({
      events: {
        method: 'GET',
        path: '/events',
        interaction: 'server-stream',
        responses: {
          ok: {
            status: 200,
            stream: 'server',
            body: z.number(),
          },
        },
      },
    })
    const implementation = http.implementation({
      contract,
      factory: () => ({
        async events(context) {
          notifyHandlerStarted()
          await handlerResume
          return context.response.ok({
            body: (async function* () {
              let sequence = 0
              while (true) yield sequence++
            })(),
          })
        },
      }),
    })
    const Module = defineModule(() => ({ executions: [implementation] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [bindHttpServer({ runtime: 'test' })],
    })
    const response = application.http.fetch(
      new Request('https://fixture.test/events'),
    )
    await handlerStarted

    const closing = application.close()
    resumeHandler()

    await expect(
      Promise.race([
        closing.then(() => 'closed' as const),
        new Promise<'timeout'>((resolve) =>
          setTimeout(() => resolve('timeout'), 250),
        ),
      ]),
    ).resolves.toBe('closed')
    await expect(response).resolves.toHaveProperty('status', 200)
  })

  it('shutdown開始と同一tickの新規requestを503で拒否する', async () => {
    const contract = http.contract({
      health: {
        method: 'GET',
        path: '/health',
        responses: { ok: { status: 204 } },
      },
    })
    const { application } = await createApplication(contract, () => ({
      health: (context) => context.response.ok({}),
    }))

    const closing = application.close()
    const response = application.http.fetch(
      new Request('https://fixture.test/health'),
    )

    await expect(response).resolves.toHaveProperty('status', 503)
    await expect(closing).resolves.toBeUndefined()
  })

  it('server-streamのiterator.returnが完了してもin-flight nextが残る間はProvider cleanupへ進まない', async () => {
    const events: string[] = []
    let resolveNext!: (value: IteratorResult<{ sequence: number }>) => void
    let markNextStarted!: () => void
    const nextStarted = new Promise<void>((resolve) => {
      markNextStarted = resolve
    })
    const blockedNext = new Promise<IteratorResult<{ sequence: number }>>(
      (resolve) => {
        resolveNext = resolve
      },
    )
    let nextCount = 0
    const source: AsyncIterable<{ sequence: number }> = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (nextCount++ === 0) {
              return Promise.resolve({
                done: false as const,
                value: { sequence: 0 },
              })
            }
            markNextStarted()
            return blockedNext
          },
          async return() {
            events.push('iterator.return')
            return { done: true, value: undefined }
          },
        }
      },
    }
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
        events: (context) => context.response.ok({ body: source }),
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
      forceShutdownTimeoutMs: 10,
    })
    const response = await application.http.fetch(
      new Request('https://fixture.test/events'),
    )
    const reader = response.body!.getReader()
    const readerClosed = reader.closed.catch(() => undefined)
    await expect(reader.read()).resolves.toMatchObject({ done: false })
    await nextStarted

    await expect(application.close()).rejects.toThrow(
      'Application shutdown did not reach a safe cleanup boundary.',
    )
    expect(events).toEqual(['iterator.return'])

    resolveNext({ done: true, value: undefined })
    await readerClosed
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    await expect(application.close()).resolves.toBeUndefined()
    expect(events).toEqual(['iterator.return', 'provider.destroy'])
  })

  it('通常HTTP ReadableStream responseもbody終了までExecution Leaseを保持する', async () => {
    const events: string[] = []
    const Body = z.custom<ReadableStream<Uint8Array>>(
      (value) => value instanceof ReadableStream,
    )
    const contract = http.contract({
      download: {
        method: 'GET',
        path: '/download',
        responses: {
          ok: { status: 200, body: Body },
        },
      },
    })
    class Resource {
      stream() {
        return new ReadableStream<Uint8Array>({
          pull(controller) {
            events.push('stream.pull')
            controller.enqueue(new TextEncoder().encode('chunk'))
          },
          cancel() {
            events.push('stream.cancel')
          },
        })
      }
      onModuleDestroy() {
        events.push('provider.destroy')
      }
    }
    const implementation = http.implementation({
      contract,
      factory: (resource = inject(Resource)) => ({
        download: (context) => context.response.ok({ body: resource.stream() }),
      }),
    })
    const Module = defineModule(() => ({
      providers: [Resource],
      executions: [implementation],
    }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [bindHttpServer({ runtime: 'test' })],
    })

    const response = await application.http.fetch(
      new Request('https://fixture.test/download'),
    )
    expect(events).not.toContain('provider.destroy')
    await expect(application.close()).resolves.toBeUndefined()
    expect(events.at(-2)).toBe('stream.cancel')
    expect(events.at(-1)).toBe('provider.destroy')
    await expect(response.text()).rejects.toThrow()
  })

  it('server-streamのiterator.returnがpendingでもshutdown timeoutでsafe boundaryを返す', async () => {
    const events: string[] = []
    let resolveReturn!: (value: IteratorResult<{ sequence: number }>) => void
    const blockedReturn = new Promise<IteratorResult<{ sequence: number }>>(
      (resolve) => {
        resolveReturn = resolve
      },
    )
    let resolveNext!: (value: IteratorResult<{ sequence: number }>) => void
    const blockedNext = new Promise<IteratorResult<{ sequence: number }>>(
      (resolve) => {
        resolveNext = resolve
      },
    )
    let nextCount = 0
    const source: AsyncIterable<{ sequence: number }> = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (nextCount++ === 0) {
              return Promise.resolve({
                done: false as const,
                value: { sequence: 0 },
              })
            }
            return blockedNext
          },
          return() {
            events.push('iterator.return')
            return blockedReturn
          },
        }
      },
    }
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
        events: (context) => context.response.ok({ body: source }),
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
      forceShutdownTimeoutMs: 10,
    })
    const response = await application.http.fetch(
      new Request('https://fixture.test/events'),
    )
    const reader = response.body!.getReader()
    await expect(reader.read()).resolves.toMatchObject({ done: false })

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
    expect(events).toEqual(['iterator.return'])

    resolveReturn({ done: true, value: undefined })
    resolveNext({ done: true, value: undefined })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    await expect(application.close()).resolves.toBeUndefined()
    expect(events).toEqual(['iterator.return', 'provider.destroy'])
  })
})
