import {
  bootstrapApplication,
  defineApplication,
  defineModule,
} from '@loutrejs/loutre'
import { bindHttpServer, http } from '@loutrejs/loutre/http'
import { z } from 'zod'
import {
  AccountModule,
  bearerAuthentication,
} from '../integrations/http-auth/src/index.js'

describe('HTTP auth integration', () => {
  it('Layerが生成したContext propertyをControllerのctxから取得する', async () => {
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [AccountModule()] }),
      capabilities: [bindHttpServer({ runtime: 'test' })],
    })
    try {
      const response = await application.http.fetch(
        new Request('http://example.test/account', {
          headers: { authorization: 'Bearer example-token' },
        }),
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        userId: 'user-1',
        tenantId: 'tenant-user-1',
      })
    } finally {
      await application.close()
    }
  })

  it('request headersをmiddleware実行前にvalidationする', async () => {
    let middlewareRan = false
    const trackingAuthentication = {
      ...bearerAuthentication,
      factory:
        () =>
        async (
          ...args: Parameters<ReturnType<typeof bearerAuthentication.factory>>
        ) => {
          middlewareRan = true
          return bearerAuthentication.factory()(...args)
        },
    }
    const Contract = http.contract({
      get: {
        method: 'GET',
        path: '/validated-account',
        request: { headers: z.object({ authorization: z.string() }) },
        responses: { ok: { status: 204 } },
        middlewares: [trackingAuthentication],
      },
    })
    const Controller = http.implementation({
      contract: Contract,
      factory: () => ({ get: (ctx) => ctx.response.ok({}) }),
    })
    const Module = defineModule(() => ({ executions: [Controller] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [bindHttpServer({ runtime: 'test' })],
    })
    try {
      const response = await application.http.fetch(
        new Request('http://example.test/validated-account'),
      )
      expect(response.status).toBe(400)
      expect(middlewareRan).toBe(false)
    } finally {
      await application.close()
    }
  })
})
