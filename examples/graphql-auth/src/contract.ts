import { http } from '@loutrejs/loutre/http'
import { httpBearerAuthentication } from './auth/bearer.js'
import { httpApiKeyAuthentication } from './auth/api-key.js'

export const ApiContract = http.contract({
  health: {
    method: 'GET',
    path: '/health',
    responses: { ok: { status: 204 } },
  },
  graphql: {
    path: '/graphql',
    routes: {
      bearer: {
        raw: true,
        method: '*',
        path: '/bearer',
        middlewares: [httpBearerAuthentication],
      },
      apiKey: {
        raw: true,
        method: '*',
        path: '/api-key',
        middlewares: [httpApiKeyAuthentication],
      },
    },
  },
})
