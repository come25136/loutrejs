import {
  defineApplication,
  defineModule,
  provide,
  token,
} from '@loutrejs/loutre'

const VALUE = token<string>('provider`name')
const provider = provide(VALUE).useValue('ok')
const Module = defineModule(() => ({
  name: 'Backtick`Module',
  providers: [provider],
}))

export default defineApplication({ modules: [Module()] })
