import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  bootstrapApplication,
  defineApplication,
  defineModule,
} from '@loutrejs/loutre'
import {
  bindHttpServer,
  http,
  validate,
  type HttpContract,
  type HttpImplementationDefinition,
} from '@loutrejs/loutre/http'

async function createHttpApplication<const TContract extends HttpContract>(
  contract: TContract,
  factory: HttpImplementationDefinition<TContract>['factory'],
) {
  const implementation = http.implementation({ contract, factory })
  const Module = defineModule(() => ({ executions: [implementation] }))
  return bootstrapApplication({
    application: defineApplication({ modules: [Module()] }),
    capabilities: [bindHttpServer({ runtime: 'test' })],
  })
}

describe('HTTP validate.body boundary', () => {
  it('validate.bodyへ到達するまでRequest.bodyをconsumeしない', async () => {
    const observations: string[] = []
    const before = http.middleware({
      name: 'before-body-validation',
      factory: () => async (context, next) => {
        observations.push(
          context.input.body instanceof ReadableStream
            ? 'before:raw'
            : 'before:decoded',
        )
        expect(context.request.bodyUsed).toBe(false)
        await next()
      },
    })
    const after = http.middleware({
      name: 'after-body-validation',
      factory: () => async (context, next) => {
        observations.push(
          context.input.body instanceof ReadableStream
            ? 'after:raw'
            : 'after:decoded',
        )
        expect(context.request.bodyUsed).toBe(true)
        await next()
      },
    })
    const Body = z.object({ value: z.string() })
    const contract = http.contract({
      create: {
        method: 'POST',
        path: '/items',
        request: {
          headers: z.object({ 'content-type': z.literal('application/json') }),
          body: Body,
        },
        middlewares: [before, validate.body, after],
        responses: { ok: { status: 200, body: Body } },
      },
    })
    const application = await createHttpApplication(contract, () => ({
      create: (context) => context.response.ok({ body: context.input.body }),
    }))

    try {
      const response = await application.http.fetch(
        new Request('http://fixture.test/items', {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ value: 'loutre' }),
        }),
      )
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ value: 'loutre' })
      expect(observations).toEqual(['before:raw', 'after:decoded'])
    } finally {
      await application.close()
    }
  })

  it('validate.body省略時はhandler直前を暗黙のvalidation boundaryにする', async () => {
    let middlewareSawRawBody = false
    const before = http.middleware({
      name: 'raw-body-observer',
      factory: () => async (context, next) => {
        middlewareSawRawBody = context.input.body instanceof ReadableStream
        expect(context.request.bodyUsed).toBe(false)
        await next()
      },
    })
    const Body = z.object({ value: z.string() })
    const contract = http.contract({
      create: {
        method: 'POST',
        path: '/items',
        request: {
          headers: z.object({ 'content-type': z.literal('application/json') }),
          body: Body,
        },
        middlewares: [before],
        responses: { ok: { status: 200, body: Body } },
      },
    })
    const application = await createHttpApplication(contract, () => ({
      create: (context) => context.response.ok({ body: context.input.body }),
    }))

    try {
      const response = await application.http.fetch(
        new Request('http://fixture.test/items', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value: 'implicit' }),
        }),
      )
      expect(middlewareSawRawBody).toBe(true)
      await expect(response.json()).resolves.toEqual({ value: 'implicit' })
    } finally {
      await application.close()
    }
  })

  it('binary media typeはbuffer化せずraw ReadableStreamをschemaへ渡す', async () => {
    const RawBody = z.custom<ReadableStream<Uint8Array>>(
      (value) => value instanceof ReadableStream,
    )
    const contract = http.contract({
      upload: {
        method: 'POST',
        path: '/upload',
        request: {
          headers: z.object({
            'content-type': z.literal('application/octet-stream'),
          }),
          body: RawBody,
        },
        middlewares: [validate.body],
        responses: { ok: { status: 200, body: z.number() } },
      },
    })
    const application = await createHttpApplication(contract, () => ({
      async upload(context) {
        const reader = context.input.body.getReader()
        let length = 0
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          length += chunk.value.byteLength
        }
        return context.response.ok({ body: length })
      },
    }))

    try {
      const response = await application.http.fetch(
        new Request('http://fixture.test/upload', {
          method: 'POST',
          headers: { 'content-type': 'application/octet-stream' },
          body: new Uint8Array([1, 2, 3, 4]),
        }),
      )
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toBe(4)
    } finally {
      await application.close()
    }
  })

  it('validate.bodyのdecode/validation失敗を400へ戻す', async () => {
    const contract = http.contract({
      create: {
        method: 'POST',
        path: '/items',
        request: {
          headers: z.object({ 'content-type': z.literal('application/json') }),
          body: z.object({ value: z.string() }),
        },
        middlewares: [validate.body],
        responses: { ok: { status: 204 } },
      },
    })
    const application = await createHttpApplication(contract, () => ({
      create: (context) => context.response.ok({}),
    }))

    try {
      const malformed = await application.http.fetch(
        new Request('http://fixture.test/items', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{',
        }),
      )
      expect(malformed.status).toBe(400)
      await expect(malformed.json()).resolves.toEqual({
        error: 'Invalid request',
      })

      const invalid = await application.http.fetch(
        new Request('http://fixture.test/items', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value: 1 }),
        }),
      )
      expect(invalid.status).toBe(400)
      await expect(invalid.json()).resolves.toEqual({
        error: 'Validation failed',
      })
    } finally {
      await application.close()
    }
  })

  it('body未宣言とvalidate.body重複を定義時に拒否する', () => {
    expect(() =>
      http.contract({
        invalid: {
          method: 'POST',
          path: '/invalid',
          middlewares: [validate.body],
          responses: { ok: { status: 204 } },
        },
      } as never),
    ).toThrow('uses validate.body but declares no request body')

    expect(() =>
      http.contract({
        invalid: {
          method: 'POST',
          path: '/invalid',
          request: {
            headers: z.object({
              'content-type': z.literal('application/json'),
            }),
            body: z.object({ value: z.string() }),
          },
          middlewares: [validate.body, validate.body],
          responses: { ok: { status: 204 } },
        },
      } as never),
    ).toThrow('declares validate.body more than once')
  })
})
