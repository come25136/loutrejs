import { NamedRepository as Repo } from './named-repository.js'
import DefaultRepo from './default-repository.js'
import * as services from './namespace-services.js'
import { ReexportedRepository } from './barrel.js'
import {
  createHttpApplication,
} from '@loutrejs/http'
import {
  defineEnv,
  defineModule,
  inject,
  provide,
  token,
} from '@loutrejs/core'
import { z } from 'zod'
import { selectedRuntime } from '@loutrejs/fixture-application-build/conditional'

class AliasService {
  constructor(readonly repository = inject(Repo)) {}
}

class DefaultService {
  constructor(readonly repository = inject(DefaultRepo)) {}
}

class NamespaceService {
  constructor(readonly repository = inject(services.NamespaceRepository)) {}
}

class ReexportService {
  constructor(readonly repository = inject(ReexportedRepository)) {}
}

class UseClassService {
  constructor(readonly repository = inject(Repo)) {}
}

class MemoryService {
  constructor(readonly repository = inject(Repo)) {}
}

class DiskService {
  constructor(readonly repository = inject(Repo)) {}
}

const USE_CLASS = token<UseClassService>('application-build.use-class')
const CONDITIONAL = token<MemoryService | DiskService>('application-build.conditional')
const RUNTIME_BRANCH = token<string>('application-build.runtime-branch')

class AppEnv extends defineEnv(z.object({
  DRIVER: z.enum(['memory', 'disk']),
})) {}

const MainModule = defineModule(() => ({
  providers: [
    Repo,
    DefaultRepo,
    services.NamespaceRepository,
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
    Repo,
    provide(CONDITIONAL).select(AppEnv.key('DRIVER'), {
      memory: MemoryService,
      disk: DiskService,
    }),
  ],
}))

export default createHttpApplication({ modules: [MainModule()] })
