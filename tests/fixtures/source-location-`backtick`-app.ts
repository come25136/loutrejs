import { application, module, provide, token } from '@loutrejs/loutre'

const VALUE = token<string>('provider`name')
const provider = provide(VALUE).useValue('ok')
const Module = module(() => ({
  name: 'Backtick`Module',
  providers: [provider],
}))

export default application({ modules: [Module()] })
