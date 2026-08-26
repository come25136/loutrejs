import {
  createUsersApplication,
} from '../../fixtures/http-crud/src/index.js'
import {
  createEventsApplication,
  createEventsMessagePortApplication,
} from '../../fixtures/streaming/src/index.js'

export function createLinkedUsersApplication() {
  return createUsersApplication()
}

export function createLinkedEventsApplication() {
  return createEventsApplication()
}

export function createLinkedEventsMessagePortApplication() {
  return createEventsMessagePortApplication()
}
