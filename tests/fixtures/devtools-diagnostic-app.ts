import {
  defineApplication,
  defineModule,
  inject,
  token,
} from '../../packages/loutre/src/index.js'
import { DevtoolsModule } from '../../packages/loutre/src/devtools/index.js'

interface MissingService {
  readonly value: string
}

const missingService = token<MissingService>('diagnostic-demo.missing')

class BrokenService {
  constructor(readonly dependency = inject(missingService)) {}
}

const AppModule = defineModule(() => ({
  imports: [DevtoolsModule()],
  providers: [BrokenService],
}))

export default defineApplication({ modules: [AppModule()] })
