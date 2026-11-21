import { module as createModule, provide, LoggerToken } from '@loutrejs/loutre'
import { LoggerService, type LogRecord } from '@loutrejs/loutre/runtime'

export function recordingLogger(records: LogRecord[]) {
  class RecordingLogger extends LoggerService {
    constructor() {
      super({ write: (record) => records.push(record) })
    }
  }
  const module = createModule({
    providers: [provide(LoggerToken).useClass(RecordingLogger)],
    exports: [LoggerToken],
  })
  return { module, root: LoggerToken }
}
