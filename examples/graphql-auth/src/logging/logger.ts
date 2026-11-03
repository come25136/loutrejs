import { defineModule, provide, LoggerToken } from '@loutrejs/loutre'
import { Logger } from '@loutrejs/loutre/runtime'

export const LoggingModule = defineModule({
  providers: [provide(LoggerToken).useClass(Logger)],
  exports: [LoggerToken],
})
