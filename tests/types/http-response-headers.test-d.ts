import { http } from '@loutrejs/http'
import { z } from 'zod'

const Contract = http.contract({
  dynamic: {
    method: 'GET',
    path: '/dynamic',
    responses: {
      ok: {
        status: 200,
        body: z.string(),
        headers: z.object({ etag: z.string() }),
      },
    },
  },
  defaults: {
    method: 'GET',
    path: '/defaults',
    responses: {
      ok: {
        status: 200,
        body: z.string(),
        headers: { 'cache-control': 'no-store' },
      },
    },
  },
  combined: {
    method: 'GET',
    path: '/combined',
    responses: {
      ok: {
        status: 200,
        body: z.string(),
        headers: {
          schema: z.object({ etag: z.string() }),
          defaults: { 'cache-control': 'no-store' },
        },
      },
    },
  },
  none: {
    method: 'GET',
    path: '/none',
    responses: { ok: { status: 200, body: z.string() } },
  },
})

http.implementation({
  contract: Contract,
  factory: () => ({
    dynamic(ctx) {
      // @ts-expect-error schemaで必須なresponse headersは省略できない
      ctx.response.ok({ body: 'ng' })
      return ctx.response.ok({ body: 'ok', headers: { etag: 'v1' } })
    },
    defaults(ctx) {
      // @ts-expect-error defaultsはFWが付与するためhandlerから返さない
      ctx.response.ok({
        body: 'ng',
        headers: { 'cache-control': 'override' },
      })
      return ctx.response.ok({ body: 'ok' })
    },
    combined(ctx) {
      return ctx.response.ok({ body: 'ok', headers: { etag: 'v1' } })
    },
    none(ctx) {
      // @ts-expect-error 未宣言のresponse headerは返せない
      ctx.response.ok({ body: 'ng', headers: { etag: 'v1' } })
      return ctx.response.ok({ body: 'ok' })
    },
  }),
})
