import { defineApplication, defineModule } from '@loutrejs/loutre'

class BomService {}

const Module = defineModule(() => ({
  name: 'BomModule',
  providers: [BomService],
}))

export default defineApplication({ modules: [Module()] })
