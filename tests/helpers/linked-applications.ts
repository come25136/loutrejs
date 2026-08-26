import { createHttpApplication } from '@loutrejs/http'
import { createMessagePortApplication } from '@loutrejs/message-port'
import { UsersModule } from '../../fixtures/http-crud/src/index.js'
import { EventsModule } from '../../fixtures/streaming/src/index.js'
import { silentLogger } from './silent-logger.js'

export function createLinkedUsersApplication() {
  return createHttpApplication({
    modules: [UsersModule()],
    logger: silentLogger,
  })
}

export function createLinkedEventsApplication() {
  return createHttpApplication({
    modules: [EventsModule()],
    logger: silentLogger,
  })
}

export function createLinkedEventsMessagePortApplication() {
  return createMessagePortApplication({
    modules: [EventsModule()],
    logger: silentLogger,
  })
}
