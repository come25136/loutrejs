import { createTestApplication } from './helpers/application.js'
import {
  contract,
  defineModule,
  implementation,
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
              tags: Array.isArray(ctx.query.tag)
                ? ctx.query.tag
                : [ctx.query.tag],
              header: ctx.headers['x-repeat'],
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
  it('multipart/form-dataをFormDataとして1回だけdecodeする', async () => {
    const Contract = contract([
      http({
        upload: {
          method: 'POST',
          path: '/multipart',
          request: {
            body: {
              contentType: 'multipart/form-data',
              schema: z.instanceof(FormData),
            },
          },
          responses: {
            accepted: {
              status: 202,
              body: z.object({ name: z.string(), size: z.number() }),
            },
          },
          pipeline: [validate.body, http.controller],
        },
      }),
    ])
    const Implementation = implementation({
      name: 'Implementation',
      contract: Contract,
      protocol: http,
      factory: () => ({
        upload(ctx) {
          const file = ctx.body.get('file')
          return ctx.response.accepted({
            body: {
              name: String(ctx.body.get('name')),
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
            body: {
              contentType: 'multipart/form-data',
              schema: z.instanceof(FormData),
            },
          },
          responses: {
            ok: { status: 200, body: z.object({ ok: z.boolean() }) },
          },
          pipeline: [validate.body, http.controller],
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
