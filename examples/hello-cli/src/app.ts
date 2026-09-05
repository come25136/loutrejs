import { defineApplication, defineModule } from '@loutrejs/loutre'
import { AppArgs } from './config/args.js'
import { hello } from './hello/task.js'

const AppModule = defineModule(() => ({
  executions: [hello],
}))

export default defineApplication({
  modules: [AppModule()],
  arguments: AppArgs,
})
