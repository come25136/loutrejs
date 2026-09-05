import { createTestApplication } from './helpers/application.js'
import {
  contract,
  defineModule,
  implementation,
  layer,
  shortCircuit,
  type ImplementationDescriptor,
} from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { z } from 'zod'
import { silentLogger } from './helpers/silent-logger.js'
describe('HTTP request semantics', () => {
  it('header名を小文字へ正規化し、duplicate queryを配列として保持する', async () => {
    const Contract = contract([
      http({
        inspect: {
          method: 'GET',
          path: '/inspect',
          request: {
            query: z.object({
              tag: z.union([z.string(), z.array(z.string())]),
            }),
            headers: z.object({ 'x-repeat': z.string() }),
          },
          responses: {
            ok: {
              status: 200,
              body: z.object({
                tags: z.array(z.string()),
                header: z.string(),
              }),
            },
          },
          pipeline: [validate.query, validate.headers, http.controller],
        },
      }),
    ])
    const Implementation = implementation({
      name: 'Implementation',
      contract: Contract,
      protocol: http,

      factory: () => ({
        inspect(ctx) {
          return ctx.response.ok({
            body: {
              tags: Array.isArray(ctx.input.query.tag)
                ? ctx.input.query.tag
                : [ctx.input.query.tag],
              header: ctx.input.headers['x-repeat'],
            },
          })
        },
      }),
    })
    const application = applicationFor(Implementation)
    const headers = new Headers()
    headers.append('X-Repeat', 'first')
    headers.append('x-repeat', 'second')
    const response = await application.fetch(
      new Request('https://fixture.test/inspect?tag=one&tag=two', { headers }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      tags: ['one', 'two'],
      header: 'first, second',
    })
  })
  it('validate.body到達前にshort circuitした場合はbodyをconsumeしない', async () => {
    let controllerCalled = false
    const reject = layer({
      name: 'reject-before-body',
      factory: () => async () =>
        shortCircuit({
          kind: 'http-result' as const,
          response: 'unauthorized' as const,
          body: { error: 'Unauthorized' },
        }),
    })
    const Contract = contract([
      http({
        create: {
          method: 'POST',
          path: '/lazy-body',
          request: {
            headers: z.object({
              'content-type': z.literal('application/json'),
            }),
            body: z.object({ name: z.string() }),
          },
          responses: {
            unauthorized: {
              status: 401,
              body: z.object({ error: z.string() }),
            },
            ok: { status: 200, body: z.object({ name: z.string() }) },
          },
          pipeline: [reject, validate.headers, validate.body, http.controller],
        },
      }),
    ])
    const Implementation = implementation({
      name: 'Implementation',
      contract: Contract,
      protocol: http,

      factory: () => ({
        create(ctx) {
          controllerCalled = true
          return ctx.response.ok({ body: ctx.input.body })
        },
      }),
    })
    const application = applicationFor(Implementation)
    const request = new Request('https://fixture.test/lazy-body', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{invalid-json',
    })
    const response = await application.fetch(request)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(controllerCalled).toBe(false)
    expect(request.bodyUsed).toBe(false)
  })

  it('validate.bodyが無い場合はmultipart bodyを未消費のstreamとして渡す', async () => {
    const Contract = contract([
      http({
        upload: {
          method: 'POST',
          path: '/raw-multipart',
          request: {
            headers: z.object({
              'content-type': z.literal('multipart/form-data'),
            }),
            body: z.instanceof(FormData),
          },
          responses: {
            accepted: {
              status: 202,
              body: z.object({ name: z.string(), size: z.number() }),
            },
          },
          pipeline: [http.controller],
        },
      }),
    ])
    const Implementation = implementation({
      name: 'Implementation',
      contract: Contract,
      protocol: http,

      factory: () => ({
        async upload(ctx) {
          expect(ctx.input.body).toBeInstanceOf(ReadableStream)
          const contentType = ctx.input.headers['content-type']
          expect(contentType).toContain('boundary=')
          if (!contentType) throw new Error('content-type is required')
          const body = await new Response(ctx.input.body, {
            headers: { 'content-type': contentType },
          }).formData()
          const file = body.get('file')
          return ctx.response.accepted({
            body: {
              name: String(body.get('name')),
              size: file instanceof File ? file.size : 0,
            },
          })
        },
      }),
    })
    const application = applicationFor(Implementation)
    const body = new FormData()
    body.set('name', 'loutre')
    body.set('file', new File(['otter'], 'otter.txt'))
    const response = await application.fetch(
      new Request('https://fixture.test/raw-multipart', {
        method: 'POST',
        body,
      }),
    )
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ name: 'loutre', size: 5 })
  })

  it('validate.bodyが無い場合はJSON bodyを未消費のstreamとして渡す', async () => {
    const Contract = contract([
      http({
        inspect: {
          method: 'POST',
          path: '/raw-json',
          request: {
            headers: z.object({
              'content-type': z.literal('application/json'),
            }),
            body: z.object({ name: z.string() }),
          },
          responses: {
            ok: {
              status: 200,
              body: z.object({ name: z.string() }),
            },
          },
          pipeline: [http.controller],
        },
      }),
    ])
    const Implementation = implementation({
      name: 'Implementation',
      contract: Contract,
      protocol: http,

      factory: () => ({
        async inspect(ctx) {
          const rawBody: ReadableStream<Uint8Array> | null = ctx.input.body
          expect(rawBody).toBeInstanceOf(ReadableStream)
          const body = (await new Response(rawBody).json()) as { name: string }
          return ctx.response.ok({ body })
        },
      }),
    })
    const application = applicationFor(Implementation)
    const response = await application.fetch(
      new Request('https://fixture.test/raw-json', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'loutre' }),
      }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ name: 'loutre' })
  })

  it('validate.bodyが無い場合はtext bodyを未消費のstreamとして渡す', async () => {
    const Contract = contract([
      http({
        inspect: {
          method: 'POST',
          path: '/raw-text',
          request: {
            headers: z.object({ 'content-type': z.literal('text/plain') }),
            body: z.string(),
          },
          responses: { ok: { status: 200, body: z.string() } },
          pipeline: [http.controller],
        },
      }),
    ])
    const Implementation = implementation({
      name: 'Implementation',
      contract: Contract,
      protocol: http,

      factory: () => ({
        async inspect(ctx) {
          const rawBody: ReadableStream<Uint8Array> | null = ctx.input.body
          expect(rawBody).toBeInstanceOf(ReadableStream)
          return ctx.response.ok({ body: await new Response(rawBody).text() })
        },
      }),
    })
    const application = applicationFor(Implementation)
    const response = await application.fetch(
      new Request('https://fixture.test/raw-text', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'loutre',
      }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toBe('loutre')
  })

  it('1つのprocedureで複数Content-Typeをdecodeできる', async () => {
    const Contract = contract([
      http({
        inspect: {
          method: 'POST',
          path: '/representations',
          request: {
            headers: z.object({
              'content-type': z.enum(['application/json', 'text/plain']),
            }),
            body: z.union([z.object({ name: z.string() }), z.string()]),
          },
          responses: {
            ok: {
              status: 200,
              body: z.object({
                kind: z.enum(['json', 'text']),
                value: z.string(),
              }),
            },
          },
          pipeline: [validate.headers, validate.body, http.controller],
        },
      }),
    ])
    const Implementation = implementation({
      name: 'Implementation',
      contract: Contract,
      protocol: http,
      factory: () => ({
        inspect(ctx) {
          return ctx.response.ok({
            body:
              typeof ctx.input.body === 'string'
                ? { kind: 'text', value: ctx.input.body }
                : { kind: 'json', value: ctx.input.body.name },
          })
        },
      }),
    })
    const application = applicationFor(Implementation)

    const jsonResponse = await application.fetch(
      new Request('https://fixture.test/representations', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ name: 'loutre' }),
      }),
    )
    expect(jsonResponse.status).toBe(200)
    expect(await jsonResponse.json()).toEqual({ kind: 'json', value: 'loutre' })

    const textResponse = await application.fetch(
      new Request('https://fixture.test/representations', {
        method: 'POST',
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        body: 'otter',
      }),
    )
    expect(textResponse.status).toBe(200)
    expect(await textResponse.json()).toEqual({ kind: 'text', value: 'otter' })
  })

  it('multipart/form-dataをFormDataとして1回だけdecodeする', async () => {
    const Contract = contract([
      http({
        upload: {
          method: 'POST',
          path: '/multipart',
          request: {
            headers: z.object({
              'content-type': z.literal('multipart/form-data'),
            }),
            body: z.instanceof(FormData),
          },
          responses: {
            accepted: {
              status: 202,
              body: z.object({ name: z.string(), size: z.number() }),
            },
          },
          pipeline: [validate.headers, validate.body, http.controller],
        },
      }),
    ])
    const Implementation = implementation({
      name: 'Implementation',
      contract: Contract,
      protocol: http,

      factory: () => ({
        upload(ctx) {
          const file = ctx.input.body.get('file')
          return ctx.response.accepted({
            body: {
              name: String(ctx.input.body.get('name')),
              size: file instanceof File ? file.size : 0,
            },
          })
        },
      }),
    })
    const application = applicationFor(Implementation)
    const body = new FormData()
    body.set('name', 'loutre')
    body.set('file', new File(['otter'], 'otter.txt'))
    const response = await application.fetch(
      new Request('https://fixture.test/multipart', { method: 'POST', body }),
    )
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ name: 'loutre', size: 5 })
  })
  it('malformed multipart bodyを400 responseへ変換する', async () => {
    const Contract = contract([
      http({
        upload: {
          method: 'POST',
          path: '/invalid-multipart',
          request: {
            headers: z.object({
              'content-type': z.literal('multipart/form-data'),
            }),
            body: z.instanceof(FormData),
          },
          responses: {
            ok: { status: 200, body: z.object({ ok: z.boolean() }) },
          },
          pipeline: [validate.headers, validate.body, http.controller],
        },
      }),
    ])
    const Implementation = implementation({
      name: 'Implementation',
      contract: Contract,
      protocol: http,

      factory: () => ({
        upload(): never {
          throw new Error('呼び出されません')
        },
      }),
    })
    const application = applicationFor(Implementation)
    const response = await application.fetch(
      new Request('https://fixture.test/invalid-multipart', {
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data; boundary=missing' },
        body: 'invalid',
      }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid request' })
  })

  it('text bodyのread失敗をdecode errorとして400へ変換する', async () => {
    const Contract = contract([
      http({
        inspect: {
          method: 'POST',
          path: '/broken-text',
          request: {
            headers: z.object({ 'content-type': z.literal('text/plain') }),
            body: z.string(),
          },
          responses: { ok: { status: 200, body: z.string() } },
          pipeline: [validate.headers, validate.body, http.controller],
        },
      }),
    ])
    const Implementation = implementation({
      name: 'Implementation',
      contract: Contract,
      protocol: http,
      factory: () => ({
        inspect(ctx) {
          return ctx.response.ok({ body: ctx.input.body })
        },
      }),
    })
    const application = applicationFor(Implementation)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('broken text body'))
      },
    })
    const request = new Request('https://fixture.test/broken-text', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })

    const response = await application.fetch(request)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid request' })
  })

  it('Request AbortSignalをControllerとserver-stream iteratorへ伝播する', async () => {
    let iteratorReturned = false
    const Contract = contract([
      http({
        subscribe: {
          method: 'GET',
          path: '/abort',
          interaction: 'server-stream',
          responses: {
            ok: {
              status: 200,
              stream: 'server',
              body: z.number(),
            },
          },
          pipeline: [http.controller],
        },
      }),
    ])
    const Implementation = implementation({
      name: 'Implementation',
      contract: Contract,
      protocol: http,

      factory: () => ({
        subscribe(ctx) {
          expect(ctx.signal).toBeInstanceOf(AbortSignal)
          const stream = async function* () {
            try {
              yield 1
              await new Promise<void>((resolve) => {
                if (ctx.signal.aborted) resolve()
                else {
                  ctx.signal.addEventListener('abort', () => resolve(), {
                    once: true,
                  })
                }
              })
            } finally {
              iteratorReturned = true
            }
          }
          return ctx.response.ok({ body: stream() })
        },
      }),
    })
    const application = applicationFor(Implementation)
    const abortController = new AbortController()
    const response = await application.fetch(
      new Request('https://fixture.test/abort', {
        signal: abortController.signal,
      }),
    )
    const reader = response.body!.getReader()
    expect((await reader.read()).done).toBe(false)
    abortController.abort(new Error('test abort'))
    await vi.waitFor(() => expect(iteratorReturned).toBe(true))
  })
})
function applicationFor(Implementation: ImplementationDescriptor) {
  const Module = defineModule(() => ({
    implementations: [Implementation],
  }))
  return createTestApplication({
    modules: [Module()],
    logger: silentLogger,
  })
}
