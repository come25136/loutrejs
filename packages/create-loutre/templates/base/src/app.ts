import { defineApplication, defineModule } from '@loutrejs/loutre'
import { AppController } from './hello/controller.js'

const AppModule = defineModule(() => ({
  name: 'AppModule',
  description: 'HTTP Application entry module',
  implementations: [AppController],
}))

export default defineApplication({
  modules: [AppModule()],
})
