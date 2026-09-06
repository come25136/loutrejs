import { http as baseHttp } from './definitions.js'

export const http: typeof baseHttp & {
  readonly capabilities: readonly ['http']
} = Object.assign(baseHttp, {
  capabilities: ['http'] as const,
})
