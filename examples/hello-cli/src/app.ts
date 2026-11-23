import { application, module } from '@loutrejs/loutre'
import { AppArgs } from './config/args.js'
import { hello } from './hello/task.js'

const AppModule = module({
  executions: [hello],
})

export default application({
  modules: [AppModule],
  arguments: AppArgs,
})
