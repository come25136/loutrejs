import {
  defineApplication,
  defineEnv,
  defineModule,
  provide,
  token,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'

export class ClassService {}
class MemoryService {}
class DiskService {}

const VALUE = token<string>('source-location.value')
const FACTORY = token<string>('source-location.factory')
const CONDITIONAL = token<MemoryService | DiskService>(
  'source-location.conditional',
)

class AppEnv extends defineEnv(
  z.object({ DRIVER: z.enum(['memory', 'disk']) }),
) {}

export const auditMiddleware = http.middleware({
  name: 'audit',
  factory: () => async (_context, next) => {
    await next()
  },
})

export const SourceContract = http.contract({
  create: {
    method: 'POST',
    path: '/source',
    middlewares: [auditMiddleware],
    responses: {
      ok: { status: 200 },
    },
  },
})

export const SourceController = http.implementation({
  name: 'SourceController',
  contract: SourceContract,
  factory: () => ({
    create(ctx) {
      return ctx.response.ok({})
    },
  }),
})

export const SourceModule = defineModule<void>(() => ({
  name: 'SourceModule',
  environment: [AppEnv],
  providers: [
    ClassService,
    provide(VALUE).useValue('value'),
    provide(FACTORY).useFactory({ use: () => 'factory' }),
    provide(CONDITIONAL).select(AppEnv.key('DRIVER'), {
      memory: MemoryService,
      disk: DiskService,
    }),
  ],
  executions: [SourceController],
}))

export default defineApplication({ modules: [SourceModule()] })
