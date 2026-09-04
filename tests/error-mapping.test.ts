import { createTestApplication } from './helpers/application.js'
import {
  contract,
  defineError,
  defineModule,
  implementation,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'
import { silentLogger } from './helpers/silent-logger.js'
describe('Domain ErrorとProtocol mapping', () => {
  it('Domain ErrorにHTTP statusを持たせず宣言variantへmappingする', async () => {
    const UserNotFound = defineError({
      code: 'USER_NOT_FOUND',
      data: z.object({ userId: z.string() }),
    })
    const Contract = contract([
      http({
        get: {
          method: 'GET',
          path: '/missing',
          responses: {
            notFound: {
              status: 404,
              body: z.object({ userId: z.string() }),
              headers: z.object({ 'x-error-code': z.string() }),
              error: http.error(UserNotFound, (error) => ({
                body: error.data,
                headers: { 'x-error-code': error.code },
              })),
            },
          },
          pipeline: [http.controller],
        },
      }),
    ])
    const Implementation = implementation({
      name: 'Implementation',
      contract: Contract,
      protocol: http,

      factory: () => ({
        get(): never {
          throw UserNotFound({ userId: 'missing-user' })
        },
      }),
    })
    const Module = defineModule(() => ({
      implementations: [Implementation],
    }))
    const application = createTestApplication({
      modules: [Module()],
      logger: silentLogger,
    })
    const response = await application.fetch(
      new Request('https://fixture.test/missing'),
    )
    expect(response.status).toBe(404)
    expect(response.headers.get('x-error-code')).toBe('USER_NOT_FOUND')
    expect(await response.json()).toEqual({ userId: 'missing-user' })
    const error = UserNotFound({ userId: 'one' })
    expect(error).not.toHaveProperty('status')
  })
})
