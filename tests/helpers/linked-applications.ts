import {
  createTestApplication,
  createTestMessagePortExecution,
} from './application.js'
import { UsersModule } from '../../examples/http-crud/src/index.js'
import { EventsModule } from '../../examples/streaming/src/index.js'
import { silentLogger } from './silent-logger.js'

export function createLinkedUsersApplication() {
  return createTestApplication({
    modules: [UsersModule()],
    logger: silentLogger,
  })
}

export function createLinkedEventsApplication() {
  return createTestApplication({
    modules: [EventsModule()],
    logger: silentLogger,
  })
}

export function createLinkedEventsMessagePortApplication() {
  return createTestMessagePortExecution([EventsModule()], silentLogger)
}
