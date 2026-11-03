import { defineModule, provide, token } from '@loutrejs/loutre'
import { Logger, type LogRecord } from '@loutrejs/loutre/runtime'

export function recordingLogger(records: LogRecord[]) {
  const root = token<Logger>('test.logger')
  const module = defineModule({
    providers: [
      provide(root).useFactory({
        use: () => new Logger({ write: (record) => records.push(record) }),
      }),
    ],
    exports: [root],
  })
  return { module, root }
}
