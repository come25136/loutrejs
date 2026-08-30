import { createTestApplication } from './helpers/application.js'
import { contract, defineModule, implementation } from '@loutrejs/loutre'
import { compileApplication } from '@loutrejs/loutre/graph'
import { http, validate } from '@loutrejs/loutre/http'
import {
  AccountController,
  AccountModule,
  authenticated,
  bearerAuthentication,
  tenantAccess,
} from '../examples/http-auth/src/index.js'
import { z } from 'zod'
import { silentLogger } from './helpers/silent-logger.js'
describe('HTTP auth example', () => {
  it('Layerが生成したContext propertyをControllerのctxから取得する', async () => {
    const application = createTestApplication({
      modules: [AccountModule()],
      logger: silentLogger,
    })
    const response = await application.fetch(
      new Request('http://example.test/account', {
        headers: { authorization: 'Bearer example-token' },
      }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      userId: 'user-1',
      tenantId: 'tenant-user-1',
    })
  })
  it('validationとtoken生成の不正な順序を静的診断する', () => {
    const InvalidContract = contract([
      http({
        get: {
          method: 'GET',
          path: '/invalid-account',
          request: {
            headers: z.object({ authorization: z.string() }),
          },
          responses: {
            found: {
              status: 200,
              body: z.object({
                userId: z.string(),
                tenantId: z.string(),
              }),
            },
          },
          pipeline: [
            authenticated,
            bearerAuthentication,
            validate.headers,
            tenantAccess,
            http.controller,
          ],
        },
      }),
    ])
    const InvalidImplementation = implementation({
      name: 'AccountController',
      contract: InvalidContract,
      protocol: http,
      factory: AccountController.factory as never,
    })
    const InvalidModule = defineModule(() => ({
      implementations: [InvalidImplementation],
    }))
    const codes = compileApplication({
      modules: [InvalidModule()],
    }).diagnostics.map(({ code }) => code)
    expect(codes).toContain('LUTRE_PIPELINE_004')
    expect(codes).toContain('LUTRE_VALIDATION_001')
  })
})
