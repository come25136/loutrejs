import { defineApplication } from '@loutrejs/loutre'
import {
  defineEnv,
  defineModule,
  inject,
  provide,
  token,
} from '@loutrejs/loutre'
import { z } from 'zod'

interface MissingDependency {
  readonly value: string
}

const MISSING = token<MissingDependency>('graph-probe.missing')
const STORAGE = token<MemoryStorage | BrokenStorage>('graph-probe.storage')

class AppEnv extends defineEnv(
  z.object({ DRIVER: z.enum(['memory', 'broken']) }),
) {}

class MemoryStorage {}

class BrokenStorage {
  constructor(readonly missing = inject(MISSING)) {}
}

const Module = defineModule(() => ({
  environment: [AppEnv],
  providers: [
    provide(STORAGE).select(AppEnv.key('DRIVER'), {
      memory: MemoryStorage,
      broken: BrokenStorage,
    }),
  ],
}))

export default defineApplication({ modules: [Module()] })
