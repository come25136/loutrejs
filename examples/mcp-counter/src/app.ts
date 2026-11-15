import { defineApplication, defineModule, inject } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { mcp } from '@loutrejs/mcp'
import { z } from 'zod'
import { endpoint, mcpPath } from './config.js'

export const readScope = 'counter:read'
export const writeScope = 'counter:write'

class CounterService {
  #value = 0

  get() {
    return this.#value
  }

  increment(by: number) {
    this.#value += by
    return this.#value
  }
}

const output = z.object({ value: z.number() })

const get = mcp.tool({
  name: 'counter.get',
  description: 'カウンターの現在値を取得する',
  scopes: [readScope],
  input: z.strictObject({}),
  output,
})
const increment = mcp.tool({
  name: 'counter.increment',
  description: '指定した数をカウンターに加算する',
  scopes: [writeScope],
  input: z.strictObject({ by: z.number().int().positive() }),
  output,
})
const Api = http.contract({ mcp: { raw: true, method: '*', path: mcpPath } })
const counterEndpoint = mcp.implementation({
  route: Api.routes.mcp,
  name: 'counter',
  version: '1.0.0',
  tools: [get, increment],
  oauth: { requiredScopes: [readScope] },
  factory: (counter = inject(CounterService)) => {
    const issuer = 'https://issuer.example'
    const publicOrigin = `https://${endpoint.host}`
    const resource = new URL(mcpPath, publicOrigin).href
    return {
      oauth: {
        publicOrigin,
        authorizationServers: [issuer],
        verifyAccessToken(token) {
          if (token !== 'demo-read' && token !== 'demo-write') return undefined
          return {
            subject: token === 'demo-write' ? 'writer' : 'reader',
            issuer,
            resource,
            expiresAt: Date.now() / 1000 + 60,
            scopes:
              token === 'demo-write' ? [readScope, writeScope] : [readScope],
          }
        },
        allowInvocation: () => true,
      },
      context: ({ principal, signal }) => ({ principal, signal }),
      tools: {
        'counter.get': () => ({ value: counter.get() }),
        'counter.increment': ({ by }) => ({ value: counter.increment(by) }),
      },
    }
  },
})
export default defineApplication({
  modules: [
    defineModule({
      providers: [CounterService],
      executions: [counterEndpoint],
    }),
  ],
})
