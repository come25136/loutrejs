import { defineError } from '@loutrejs/loutre'
import {
  basicAuth,
  cors,
  createHttpClient,
  http,
  type BasicAuthContext,
  type BasicAuthDefinition,
  type BasicAuthUnauthorized,
  type BearerAuthContext,
  type BearerAuthDefinition,
  type BearerAuthUnauthorized,
  type CorsLayerDescriptor,
  type HttpClient,
  type HttpClientTransport,
} from '@loutrejs/loutre/http'
import { z } from 'zod'

const contract = http.contract({
  get: {
    method: 'GET',
    path: '/users/{id}',
    request: {
      params: { id: z.string() },
      query: z.object({ includePosts: z.boolean().optional() }),
    },
    responses: {
      ok: {
        status: 200,
        body: z.object({ id: z.string(), name: z.string() }),
      },
      notFound: {
        status: 404,
        body: z.object({ message: z.string() }),
      },
    },
  },
  create: {
    method: 'POST',
    path: '/users',
    request: {
      headers: z.object({ 'content-type': z.literal('application/json') }),
      body: z.object({ name: z.string() }),
    },
    responses: {
      created: {
        status: 201,
        body: z.object({ id: z.string(), name: z.string() }),
      },
    },
  },
  health: {
    method: 'GET',
    path: '/health',
    responses: { ok: { status: 204 } },
  },
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

declare const transport: HttpClientTransport
const client = createHttpClient(contract, transport)
const compatible: HttpClient<typeof contract> = client
void compatible

client.get({
  params: { id: '42' },
  query: { includePosts: true },
})
client.create({
  headers: { 'content-type': 'application/json' },
  body: { name: 'Ada' },
})
client.health()
client.events()

// @ts-expect-error path parameterは必須
client.get({ query: {} })
// @ts-expect-error bodyを宣言したrouteではbodyが必須
client.create({ headers: { 'content-type': 'application/json' } })
client.create({
  headers: {
    // @ts-expect-error Content-TypeはContract schemaに従う
    'content-type': 'text/plain',
  },
  body: { name: 'Ada' },
})
// @ts-expect-error requestを持たないrouteは引数を受け取らない
client.health({})

type GetResult = Awaited<ReturnType<typeof client.get>>
declare const result: GetResult
if (result.status === 200) {
  const id: string = result.body.id
  void id
} else {
  const status: 404 = result.status
  const message: string = result.body.message
  void [status, message]
}

type EventResult = Awaited<ReturnType<typeof client.events>>
declare const events: EventResult
const stream: AsyncIterable<{ sequence: number }> = events.body
void stream

http.implementation({
  contract,
  factory: () => ({
    get: (ctx) => ctx.response.ok({ body: { id: '1', name: 'Loutre' } }),
    create: (ctx) =>
      ctx.response.created({ body: { id: '1', name: ctx.input.body.name } }),
    health: (ctx) => ctx.response.ok({}),
    events: (ctx) =>
      ctx.response.ok({
        body: (async function* () {
          yield { sequence: 1 }
        })(),
      }),
  }),
})

const DomainFailure = defineError({
  code: 'DOMAIN_FAILURE',
  data: z.object({ message: z.string() }),
})

http.contract({
  mapped: {
    method: 'GET',
    path: '/mapped',
    responses: {
      badRequest: {
        status: 400,
        body: z.object({ message: z.string() }),
        error: http.error(DomainFailure),
      },
    },
  },
})

const invalidErrorMapping = {
  mapped: {
    method: 'GET',
    path: '/mapped',
    responses: {
      badRequest: {
        status: 400,
        body: z.object({ message: z.string() }),
        error: http.error(DomainFailure, () => ({ body: { message: 42 } })),
      },
    },
  },
} as const
// @ts-expect-error error mapping bodyはresponse schema outputと一致する必要がある
http.contract(invalidErrorMapping)

const streamWithoutBody = {
  events: {
    method: 'GET',
    path: '/events',
    responses: { ok: { status: 200, stream: 'server' } },
  },
} as const
// @ts-expect-error server-stream responseはitem body schemaが必須
http.contract(streamWithoutBody)

const corsLayer: CorsLayerDescriptor = cors()
void corsLayer

type AuthState = { readonly currentUser: { readonly id: string } }
type UnauthorizedBody = { readonly error: string }
const basicDefinition: BasicAuthDefinition<
  AuthState,
  'unauthorized',
  UnauthorizedBody
> = {
  realm: 'fixture',
  factory: () => ({
    authenticate: () => ({ currentUser: { id: 'user-1' } }),
    unauthorized: (): BasicAuthUnauthorized<
      'unauthorized',
      UnauthorizedBody
    > => ({
      response: 'unauthorized',
      body: { error: 'required' },
    }),
  }),
}
const basic = basicAuth(basicDefinition)
void basic

declare const basicContext: BasicAuthContext
declare const bearerContext: BearerAuthContext
const basicAuthorization: string | undefined =
  basicContext.input.headers.authorization
const bearerAuthorization: string | undefined =
  bearerContext.input.headers.authorization
void [basicAuthorization, bearerAuthorization]

type BearerDefinition = BearerAuthDefinition<
  AuthState,
  'unauthorized',
  UnauthorizedBody
>
declare const bearerDefinition: BearerDefinition
declare const bearerUnauthorized: BearerAuthUnauthorized<
  'unauthorized',
  UnauthorizedBody
>
void [bearerDefinition, bearerUnauthorized]
