import { http } from '@loutrejs/loutre/http'
import { ApiContract } from './contract.js'

export const HealthHttp = http.implementation({
  name: 'HealthHttp',
  contract: ApiContract,
  factory: () => ({ health: (ctx) => ctx.response.ok({}) }),
})
