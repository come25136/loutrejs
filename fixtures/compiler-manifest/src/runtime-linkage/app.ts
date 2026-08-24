import type { NamedRepository as Repo } from './named-repository.js'
import type DefaultRepo from './default-repository.js'
import type * as services from './namespace-services.js'
import type { ReexportedRepository } from './barrel.js'
import {
  createHttpApplication,
} from '@loutrejs/http'
import {
  defineEnv,
  defineModule,
  provide,
  token,
} from '@loutrejs/core'
import { z } from 'zod'
import { selectedRuntime } from '@loutrejs/fixture-compiler-manifest/conditional'

class AliasService {
  constructor(readonly repository: Repo) {}
}

class DefaultService {
  constructor(readonly repository: DefaultRepo) {}
}

class NamespaceService {
  constructor(readonly repository: services.NamespaceRepository) {}
}

class ReexportService {
  constructor(readonly repository: ReexportedRepository) {}
}

class UseClassService {
  constructor(readonly repository: Repo) {}
}

class MemoryService {
  constructor(readonly repository: Repo) {}
}

class DiskService {
  constructor(readonly repository: Repo) {}
}

const USE_CLASS = token<UseClassService>('runtime-linkage.use-class')
const CONDITIONAL = token<MemoryService | DiskService>('runtime-linkage.conditional')
const RUNTIME_BRANCH = token<string>('runtime-linkage.runtime-branch')

class AppEnv extends defineEnv(z.object({
  DRIVER: z.enum(['memory', 'disk']),
})) {}

const MainModule = defineModule(() => ({
  providers: [
    AliasService,
    DefaultService,
    NamespaceService,
    ReexportService,
    provide(USE_CLASS).useClass(UseClassService),
    provide(RUNTIME_BRANCH).useValue(selectedRuntime),
  ],
}))

export const ConditionalModule = defineModule(() => ({
  providers: [
    provide(CONDITIONAL).select(AppEnv.key('DRIVER'), {
      memory: MemoryService,
      disk: DiskService,
    }),
  ],
}))

export default createHttpApplication({ modules: [MainModule()] })
