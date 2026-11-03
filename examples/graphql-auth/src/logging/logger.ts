import { defineModule, inject, provide, LoggerToken } from '@loutrejs/loutre'
import { ConsoleLoggerBackend, Logger } from '@loutrejs/loutre/runtime'

class LoggerService extends Logger {
  constructor(backend = inject(ConsoleLoggerBackend)) {
    super(backend)
  }
}

export const LoggingModule = defineModule({
  providers: [
    ConsoleLoggerBackend,
    provide(LoggerToken).useClass(LoggerService),
  ],
  exports: [LoggerToken],
})
