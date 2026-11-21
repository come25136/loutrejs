import { bootstrapApplication, application } from '@loutrejs/loutre'
import { EventsMessagePortModule } from '../../integrations/streaming/src/index.js'
import { silentLoggingModule } from './silent-logger.js'

export function createLinkedEventsMessagePortApplication() {
  return bootstrapApplication({
    application: application({
      modules: [silentLoggingModule, EventsMessagePortModule()],
    }),
  })
}
