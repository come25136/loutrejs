import {
  defineApplication,
  defineModule,
} from '../../packages/loutre/src/index.js'
import { DevtoolsModule } from '../../packages/loutre/src/devtools/index.js'

const AppModule = defineModule(() => ({
  imports: [DevtoolsModule()],
}))

export default defineApplication({ modules: [AppModule()] })
