import { bootstrapApplication, defineApplication } from '@loutrejs/loutre'
import { EventsMessagePortModule } from '../../integrations/streaming/src/index.js'
import { silentLogger, silentLoggingModule } from './silent-logger.js'

export function createLinkedEventsMessagePortApplication() {
  return bootstrapApplication({
    application: defineApplication({
      modules: [silentLoggingModule, EventsMessagePortModule()],
      logger: silentLogger,
    }),
  })
}
