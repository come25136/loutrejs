import { defineModule, provide, LoggerToken } from '@loutrejs/loutre'
import { Logger, type LogRecord } from '@loutrejs/loutre/runtime'

export function recordingLogger(records: LogRecord[]) {
  class RecordingLogger extends Logger {
    constructor() {
      super({ write: (record) => records.push(record) })
    }
  }
  const module = defineModule({
    providers: [provide(LoggerToken).useClass(RecordingLogger)],
    exports: [LoggerToken],
  })
  return { module, root: LoggerToken }
}
