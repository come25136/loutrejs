import { application, module, provide, token } from '@loutrejs/loutre'
import { EventEmitter } from 'node:events'

class LocalService {}

const EXTERNAL = token<EventEmitter>('review.external-class')
const LOCAL = token<LocalService>('review.local-class')

const externalProvider = provide(EXTERNAL).useClass(EventEmitter)
const localProvider = provide(LOCAL).useClass(LocalService)

const Module = module(() => ({
  name: 'UseClassSourceModule',
  providers: [LocalService, externalProvider, localProvider],
}))

export default application({ modules: [Module()] })
