import { defineModule, provide, LoggerToken } from '@loutrejs/loutre'
import { SilentLogger } from '@loutrejs/loutre/runtime'

export const silentLoggingModule = defineModule({
  providers: [provide(LoggerToken).useClass(SilentLogger)],
  exports: [LoggerToken],
})
