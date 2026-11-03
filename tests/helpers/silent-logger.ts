import { defineModule } from '@loutrejs/loutre'
import { SilentLogger } from '@loutrejs/loutre/runtime'

export const silentLogger = SilentLogger
export const silentLoggingModule = defineModule({
  providers: [SilentLogger],
  exports: [SilentLogger],
})
