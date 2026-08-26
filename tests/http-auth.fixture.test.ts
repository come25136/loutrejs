import {
  contract,
  defineModule,
  implementation,
  procedure,
} from '@loutrejs/core'
import { compileApplication } from '@loutrejs/graph'
import { createHttpApplication, http, validate } from '@loutrejs/http'
import {
  AccountController,
  AccountModule,
  authenticated,
  bearerAuthentication,
  tenantAccess,
} from '../fixtures/http-auth/src/index.js'
import { z } from 'zod'
import { silentLogger } from './helpers/silent-logger.js'

describe('canonical Fixture B', () => {
  it('Layerが生成したContext propertyをControllerのctxから取得する', async () => {
    const application = createHttpApplication({
      modules: [AccountModule()],
      logger: silentLogger,
    })
    const response = await application.handle(
      new Request('http://fixture.test/account', {
        headers: { authorization: 'Bearer fixture-token' },
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      userId: 'user-1',
      tenantId: 'tenant-user-1',
    })
  })

  it('validationとtoken生成の不正な順序を静的診断する', () => {
    const InvalidContract = contract({
      get: procedure({
        protocols: {
          http: http({
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
          }),
        },
      }),
    })
    const InvalidImplementation = implementation({
      name: 'AccountController',
      contract: InvalidContract,
      protocol: http,
      factory: AccountController.factory as never,
    })
    const InvalidModule = defineModule(() => ({
      implementations: [InvalidImplementation],
    }))
    const codes = compileApplication([InvalidModule()]).diagnostics.map(
      ({ code }) => code,
    )

    expect(codes).toContain('LUTRE_PIPELINE_004')
    expect(codes).toContain('LUTRE_VALIDATION_001')
  })
})
