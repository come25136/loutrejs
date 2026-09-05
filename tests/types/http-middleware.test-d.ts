import { defineLayer, type, token } from '@loutrejs/loutre'
import { http } from '@loutrejs/http'

declare const invalidInput: boolean

const PREFIX = token<string>('prefix')
const identity = http.middleware({
  name: 'identity',
  state: type<{ userId: string }>(),
  inject: [PREFIX],
  factory: (prefix) => async (context, next) => {
    const request: Request = context.request
    void request
    if (invalidInput) {
      // @ts-expect-error stateの必須propertyを省略できない
      await next()
      // @ts-expect-error userIdはstring
      await next({ userId: 42 })
    }
    return next({ userId: `${prefix}:user` })
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
    return next({ traceId: 'trace' })
  },
})
