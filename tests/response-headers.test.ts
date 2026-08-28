import { defineApplication } from '@loutrejs/loutre'
import {
  contract,
  defineModule,
  implementation,
  procedure,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { lambdaRuntime } from '@loutrejs/loutre/runtime/lambda'
import { nodeRuntime } from '@loutrejs/node'
import { z } from 'zod'
import { reserveHttpPort } from './helpers/http-server.js'
import { silentLogger } from './helpers/silent-logger.js'

describe('複数値HTTP response header', () => {
  it('Node runtimeが複数のSet-Cookieを別々に保持する', async () => {
    const port = await reserveHttpPort()
    const runtime = await nodeRuntime.serve({
      application: cookieApplication(),
      port,
      hostname: '127.0.0.1',
    })

    try {
      const response = await fetch(`http://127.0.0.1:${port}/cookies`)
      expect(response.headers.getSetCookie()).toEqual([
        'first=one; Path=/',
        'second=two; Path=/',
      ])
    } finally {
      await runtime.close()
    }
  })

  it('Lambda runtimeがSet-Cookieをcookiesへ分離する', async () => {
    const handler = lambdaRuntime.bind({ application: cookieApplication() })
    const result = await handler({ rawPath: '/cookies' })

    expect(result.cookies).toEqual(['first=one; Path=/', 'second=two; Path=/'])
    expect(result.headers).not.toHaveProperty('set-cookie')
  })
})

function cookieApplication() {
  const Contract = contract({
    get: procedure({
      protocols: {
        http: http({
          method: 'GET',
          path: '/cookies',
          responses: {
            ok: {
              status: 200,
              headers: z.object({
                'set-cookie': z.array(z.string()),
              }),
              body: z.string(),
            },
          },
          pipeline: [http.controller],
        }),
      },
    }),
  })
  const Controller = implementation({
    name: 'CookieController',
    contract: Contract,
    protocol: http,
    factory: () => ({
      get: (ctx) =>
        ctx.response.ok({
          body: 'ok',
          headers: {
            'set-cookie': ['first=one; Path=/', 'second=two; Path=/'],
          },
        }),
    }),
  })
  const Module = defineModule(() => ({
    implementations: [Controller],
  }))
  return defineApplication({
    modules: [Module()],
    logger: silentLogger,
  })
}
