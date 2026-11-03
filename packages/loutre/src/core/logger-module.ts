import { LoggerToken } from './logger.js'
import { defaultLoggerProviders } from './logger-internal.js'
import { defineModule } from './module.js'

export const LoggerModule = defineModule({
  name: 'LoggerModule',
  providers: defaultLoggerProviders(),
  exports: [LoggerToken],
})
