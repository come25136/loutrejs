import { http, type HttpHandlers } from '@loutrejs/loutre/http'
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

type Handlers = HttpHandlers<typeof Contract>

// @ts-expect-error schemaで必須なresponse headersは省略できない
const missing: Handlers['dynamic'] = () => ({
  schema: Contract.dynamic.ok,
  body: 'ng',
})
const override: Handlers['defaults'] = () => ({
  schema: Contract.defaults.ok,
  body: 'ng',
  // @ts-expect-error defaultsはFWが付与するためhandlerから返さない
  headers: { 'cache-control': 'override' },
})
const extra: Handlers['none'] = () => ({
  schema: Contract.none.ok,
  body: 'ng',
  // @ts-expect-error 未宣言のresponse headerは返せない
  headers: { etag: 'v1' },
})
void [missing, override, extra]

http.implementation({
  contract: Contract,
  factory: () => ({
    dynamic: () => ({
      schema: Contract.dynamic.ok,
      body: 'ok',
      headers: { etag: 'v1' },
    }),
    defaults: () => ({ schema: Contract.defaults.ok, body: 'ok' }),
    combined: () => ({
      schema: Contract.combined.ok,
      body: 'ok',
      headers: { etag: 'v1' },
    }),
    none: () => ({ schema: Contract.none.ok, body: 'ok' }),
  }),
})
