import {
  contract,
  defineModule,
  implement,
  procedure,
} from '@loutrejs/core'
import {
  ContextOf,
  ControllerOf,
  createHttpApplication,
  http,
  validate,
} from '@loutrejs/http'
import { z } from 'zod'

describe('HTTP request semantics', () => {
  it('header名を小文字へ正規化し、duplicate queryを配列として保持する', async () => {
    const Contract = contract({
      inspect: procedure({
        protocols: {
          http: http({
            method: 'GET',
            path: '/inspect',
            request: {
              query: z.object({ tag: z.union([z.string(), z.array(z.string())]) }),
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
          }),
        },
      }),
    })
    type Controller = ControllerOf<typeof Contract, 'http'>
    class Implementation implements Controller {
      inspect(ctx: ContextOf<Controller, 'inspect'>) {
        return ctx.response.ok({
          body: {
            tags: Array.isArray(ctx.query.tag) ? ctx.query.tag : [ctx.query.tag],
            header: ctx.headers['x-repeat'],
          },
        })
      }
    }
    const application = applicationFor(Contract, Implementation)
    const headers = new Headers()
    headers.append('X-Repeat', 'first')
    headers.append('x-repeat', 'second')

    const response = await application.handle(
      new Request('https://fixture.test/inspect?tag=one&tag=two', { headers }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      tags: ['one', 'two'],
      header: 'first, second',
    })
  })

  it('multipart/form-dataをFormDataとして1回だけdecodeする', async () => {
    const Contract = contract({
      upload: procedure({
        protocols: {
          http: http({
            method: 'POST',
            path: '/multipart',
            request: { body: z.instanceof(FormData) },
            responses: {
              accepted: {
                status: 202,
                body: z.object({ name: z.string(), size: z.number() }),
              },
            },
            pipeline: [validate.body, http.controller],
          }),
        },
      }),
    })
    type Controller = ControllerOf<typeof Contract, 'http'>
    class Implementation implements Controller {
      upload(ctx: ContextOf<Controller, 'upload'>) {
        const file = ctx.body.get('file')
        return ctx.response.accepted({
          body: {
            name: String(ctx.body.get('name')),
            size: file instanceof File ? file.size : 0,
          },
        })
      }
    }
    const application = applicationFor(Contract, Implementation)
    const body = new FormData()
    body.set('name', 'loutre')
    body.set('file', new File(['otter'], 'otter.txt'))

    const response = await application.handle(
      new Request('https://fixture.test/multipart', { method: 'POST', body }),
    )

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ name: 'loutre', size: 5 })
  })

  it('malformed multipart bodyを400 responseへ変換する', async () => {
    const Contract = contract({
      upload: procedure({
        protocols: {
          http: http({
            method: 'POST',
            path: '/invalid-multipart',
            request: { body: z.instanceof(FormData) },
            responses: {
              ok: { status: 200, body: z.object({ ok: z.boolean() }) },
            },
            pipeline: [validate.body, http.controller],
          }),
        },
      }),
    })
    class Implementation {
      upload() {
        throw new Error('呼び出されません')
      }
    }
    const application = applicationFor(Contract, Implementation)

    const response = await application.handle(
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
    const Contract = contract({
      subscribe: procedure({
        protocols: {
          http: http({
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
          }),
        },
      }),
    })
    type Controller = ControllerOf<typeof Contract, 'http'>
    class Implementation implements Controller {
      subscribe(ctx: ContextOf<Controller, 'subscribe'>) {
        expect(ctx.signal).toBeInstanceOf(AbortSignal)
        const stream = async function* () {
          try {
            yield 1
            await new Promise<void>((resolve) => {
              if (ctx.signal.aborted) resolve()
              else ctx.signal.addEventListener('abort', () => resolve(), { once: true })
            })
          } finally {
            iteratorReturned = true
          }
        }
        return ctx.response.ok({ body: stream() })
      }
    }
    const application = applicationFor(Contract, Implementation)
    const abortController = new AbortController()
    const response = await application.handle(
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

function applicationFor(
  Contract: Parameters<typeof implement>[0],
  Implementation: new (...args: any[]) => any,
) {
  const Module = defineModule(() => ({
    implementations: [
      implement(Contract).for(http).with(Implementation as never),
    ],
  }))
  return createHttpApplication({ modules: [Module()] })
}
