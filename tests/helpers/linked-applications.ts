import { bootstrapApplication, defineApplication } from '@loutrejs/loutre'
import { EventsMessagePortModule } from '../../integrations/streaming/src/index.js'
import { silentLogger } from './silent-logger.js'

export function createLinkedEventsMessagePortApplication() {
  return bootstrapApplication({
    application: defineApplication({
      modules: [EventsMessagePortModule()],
      logger: silentLogger,
    }),
  })
}
