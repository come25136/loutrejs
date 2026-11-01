import { http } from '@loutrejs/loutre/http'
import { httpAuthentication } from './auth/http.js'

export const ApiContract = http.contract({
  health: {
    method: 'GET',
    path: '/health',
    responses: { ok: { status: 204 } },
  },
  graphql: {
    raw: true,
    method: '*',
    path: '/graphql',
    middlewares: [httpAuthentication],
  },
})
