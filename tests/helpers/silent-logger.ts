import { module, provide, LoggerToken } from '@loutrejs/loutre'
import { SilentLogger } from '@loutrejs/loutre/runtime'

export const silentLoggingModule = module({
  providers: [provide(LoggerToken).useClass(SilentLogger)],
  exports: [LoggerToken],
})
