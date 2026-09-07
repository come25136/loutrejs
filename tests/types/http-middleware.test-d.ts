import { defineLayer, inject, type, token } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'

declare const invalidInput: boolean

const PREFIX = token<string>('prefix')
const identity = http.middleware({
  name: 'identity',
  state: type<{ userId: string }>(),
  factory:
    (prefix = inject(PREFIX)) =>
    async (context, next) => {
      const request: Request = context.request
      const input: unknown = context.input
      void request
      void input
      if (invalidInput) {
        // @ts-expect-error stateの必須propertyを省略できない
        await next()
        // @ts-expect-error userIdはstring
        await next({ userId: 42 })
      }
      const result: void = await next({ userId: `${prefix}:user` })
      void result
    },
})
const contract = http.contract({
  profile: {
    method: 'GET',
    path: '/profile',
    middlewares: [identity],
    responses: { ok: { status: 204 } },
  },
})
http.implementation({
  contract,
  factory: () => ({
    profile: (context) => {
      // @ts-expect-error raw Requestはcontroller Contextへ公開しない
      context.request
      const userId: string = context.state.userId
      void userId
      return context.response.ok({})
    },
  }),
})
defineLayer({
  name: 'generic',
  state: type<{ traceId: string }>(),
  factory: () => async (_context, next) => {
    // @ts-expect-error traceIdの型が異なる
    if (invalidInput) await next({ traceId: 42 })
    await next({ traceId: 'trace' })
  },
})

const inferredGeneric = defineLayer<{ traceId: string }>({
  name: 'generic.explicit-contribution',
  factory: () => async (_context, next) => {
    if (invalidInput) {
      // @ts-expect-error traceIdの型が異なる
      await next({ traceId: 42 })
    }
    await next({ traceId: 'trace' })
  },
})
const inferredGenericContract = http.contract({
  trace: {
    method: 'GET',
    path: '/trace',
    middlewares: [inferredGeneric],
    responses: { ok: { status: 204 } },
  },
})
http.implementation({
  contract: inferredGenericContract,
  factory: () => ({
    trace: (context) => {
      const traceId: string = context.state.traceId
      void traceId
      return context.response.ok({})
    },
  }),
})

const nestedContract = http.contract({
  api: {
    path: '/api',
    responses: { unavailable: { status: 503 } },
    routes: {
      traced: {
        path: '/traced',
        middlewares: [inferredGeneric],
        routes: contract.routes,
      },
    },
  },
})
http.implementation({
  contract: nestedContract,
  factory: () => ({
    profile: (context) => {
      const traceId: string = context.state.traceId
      const path: '/api/traced/profile' = nestedContract.routes.profile.path
      void [traceId, path]
      if (invalidInput) {
        return context.response.unavailable({})
      }
      return context.response.ok({})
    },
  }),
})

// 親子で同じresponse名を宣言すると継承結果が曖昧になる
// @ts-expect-error inherited response名の衝突を拒否する
http.contract({
  api: {
    responses: { failed: { status: 500 } },
    routes: {
      profile: {
        method: 'GET',
        path: '/profile',
        responses: { failed: { status: 400 } },
      },
    },
  },
})
