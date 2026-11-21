import { LoggerToken } from './logger.js'
import { defaultLoggerProviders } from './logger-internal.js'
import { module } from './module.js'

export const LoggerModule = module({
  name: 'LoggerModule',
  providers: defaultLoggerProviders(),
  exports: [LoggerToken],
})
