import { bootstrapApplication, defineApplication } from '@loutrejs/loutre'
import { createTestApplication } from './application.js'
import { UsersModule } from '../../integrations/http-crud/src/index.js'
import {
  EventsHttpModule,
  EventsMessagePortModule,
} from '../../integrations/streaming/src/index.js'
import { silentLogger } from './silent-logger.js'

export function createLinkedUsersApplication() {
  return createTestApplication({
    modules: [UsersModule()],
    logger: silentLogger,
  })
}

export function createLinkedEventsApplication() {
  return createTestApplication({
    modules: [EventsHttpModule()],
    logger: silentLogger,
  })
}

export function createLinkedEventsMessagePortApplication() {
  return bootstrapApplication({
    application: defineApplication({
      modules: [EventsMessagePortModule()],
      logger: silentLogger,
    }),
  })
}
