import { application, module } from '../../packages/loutre/src/index.js'
import { DevtoolsModule } from '../../packages/loutre/src/devtools/index.js'

const AppModule = module(() => ({
  imports: [DevtoolsModule()],
}))

export default application({ modules: [AppModule()] })
