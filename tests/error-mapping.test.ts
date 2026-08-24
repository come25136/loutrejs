import {
  contract,
  defineError,
  defineModule,
  implement,
  procedure,
} from '@loutrefw/core'
import {
  ContextOf,
  ControllerOf,
  createHttpApplication,
  http,
} from '@loutrefw/http'
import { z } from 'zod'

describe('Domain ErrorとProtocol mapping', () => {
  it('Domain ErrorにHTTP statusを持たせず宣言variantへmappingする', async () => {
    const UserNotFound = defineError({
      code: 'USER_NOT_FOUND',
      data: z.object({ userId: z.string() }),
    })
    const Contract = contract({
      get: procedure({
        protocols: {
          http: http({
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
          }),
        },
      }),
    })
    type Controller = ControllerOf<typeof Contract, 'http'>
    class Implementation implements Controller {
      get(_ctx: ContextOf<Controller, 'get'>): never {
        throw UserNotFound({ userId: 'missing-user' })
      }
    }
    const Module = defineModule(() => ({
      implementations: [implement(Contract).for(http).with(Implementation)],
    }))
    const application = createHttpApplication({ modules: [Module()] })
    const response = await application.handle(
      new Request('https://fixture.test/missing'),
    )

    expect(response.status).toBe(404)
    expect(response.headers.get('x-error-code')).toBe('USER_NOT_FOUND')
    expect(await response.json()).toEqual({ userId: 'missing-user' })
    const error = UserNotFound({ userId: 'one' })
    expect(error).not.toHaveProperty('status')
  })
})
