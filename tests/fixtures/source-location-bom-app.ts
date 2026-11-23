import { application, module } from '@loutrejs/loutre'

class BomService {}

const Module = module(() => ({
  name: 'BomModule',
  providers: [BomService],
}))

export default application({ modules: [Module()] })
