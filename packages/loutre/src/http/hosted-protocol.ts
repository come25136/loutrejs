import { http as baseHttp } from './definitions.js'

export const http = Object.freeze({
  ...baseHttp,
  capabilities: ['http'] as const,
})
