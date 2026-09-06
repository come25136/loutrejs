import { z } from 'zod'
import { basicAuth, http } from '@loutrejs/http'

const bodyWithoutHeaders = {
  create: {
    method: 'POST',
    path: '/items',
    request: { body: z.object({ value: z.string() }) },
    responses: { ok: { status: 204 } },
  },
} as const
// @ts-expect-error bodyを宣言するContractはrequired string content-typeをheadersで宣言する
http.contract(bodyWithoutHeaders)

const optionalContentType = {
  create: {
    method: 'POST',
    path: '/items',
    request: {
      headers: z.object({ 'content-type': z.string().optional() }),
      body: z.object({ value: z.string() }),
    },
    responses: { ok: { status: 204 } },
  },
} as const
// @ts-expect-error content-typeはinput/outputともrequired stringでなければならない
http.contract(optionalContentType)

const invalidStatus = {
  invalid: {
    method: 'GET',
    path: '/invalid',
    responses: { ok: { status: 199 } },
  },
} as const
// @ts-expect-error response statusは200-599のliteralでなければならない
http.contract(invalidStatus)

const bodylessResponseWithBody = {
  invalid: {
    method: 'GET',
    path: '/invalid',
    responses: { ok: { status: 204, body: z.string() } },
  },
} as const
// @ts-expect-error 204/205/304 responseはbodyを宣言できない
http.contract(bodylessResponseWithBody)

const mismatchedParams = {
  user: {
    method: 'GET',
    path: '/users/{id}',
    request: { params: { other: z.string() } },
    responses: { ok: { status: 204 } },
  },
} as const
// @ts-expect-error params schemaはpath parameterと完全一致する
http.contract(mismatchedParams)

const nonStringParamInput = {
  user: {
    method: 'GET',
    path: '/users/{id}',
    request: { params: { id: z.number() } },
    responses: { ok: { status: 204 } },
  },
} as const
// @ts-expect-error raw path parameterはstringなのでschema inputがstringを受理する必要がある
http.contract(nonStringParamInput)

const authentication = basicAuth({
  realm: 'Loutre',
  factory: () => ({
    authenticate: () => ({ currentUser: { id: 'user-1' } }),
    unauthorized: () => ({
      response: 'unauthorized' as const,
      body: { error: 'Authentication required' },
    }),
  }),
})

const authWithoutUnauthorizedResponse = {
  profile: {
    method: 'GET',
    path: '/profile',
    responses: { ok: { status: 204 } },
    middlewares: [authentication],
  },
} as const
// @ts-expect-error middleware short-circuitはContractでresponseを宣言する
http.contract(authWithoutUnauthorizedResponse)

http.contract({
  profile: {
    method: 'GET',
    path: '/profile',
    responses: {
      ok: { status: 204 },
      unauthorized: {
        status: 401,
        body: z.object({ error: z.string() }),
        headers: z.object({ 'www-authenticate': z.string() }),
      },
    },
    middlewares: [authentication],
  },
})
