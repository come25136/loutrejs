import { domainError } from '@loutrejs/loutre'
import {
  http,
  type BasicAuthContext,
  type BasicAuthDefinition,
  type BasicAuthUnauthorized,
  type BearerAuthContext,
  type BearerAuthDefinition,
  type BearerAuthUnauthorized,
  type CorsLayerDescriptor,
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

http.implementation({
  contract,
  factory: () => ({
    get: () => ({ schema: contract.get.ok, body: { id: '1', name: 'Loutre' } }),
    create: (ctx) => ({
      schema: contract.create.created,
      body: { id: '1', name: ctx.input.body.name },
    }),
    health: () => ({ schema: contract.health.ok }),
    events: () => ({
      schema: contract.events.ok,
      body: (async function* () {
        yield { sequence: 1 }
      })(),
    }),
  }),
})

const DomainFailure = domainError({
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

const corsLayer: CorsLayerDescriptor = http.cors()
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
const basic = http.basicAuth(basicDefinition)
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
