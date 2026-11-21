import { application, module } from '@loutrejs/loutre'
import { AppController } from './hello/controller.js'

const AppModule = module({
  name: 'AppModule',
  description: 'HTTP Application entry module',
  executions: [AppController],
})

export default application({
  modules: [AppModule],
})
