import {
  linkApplication,
  type CompiledApplicationArtifacts,
} from '@loutrefw/runtime/internal'
import {
  createUsersApplication,
  UsersController,
  UsersService,
} from '../../fixtures/http-crud/src/index.js'
import {
  createEventsApplication,
  createEventsMessagePortApplication,
  EventsController,
  EventsMessageHandler,
  EventStreamService,
} from '../../fixtures/streaming/src/index.js'

const fingerprint = 'test-internal-linkage'

function artifacts(
  bindings: CompiledApplicationArtifacts['linkage']['bindings'],
): CompiledApplicationArtifacts {
  return {
    graph: { version: 1, fingerprint },
    linkage: { version: 1, fingerprint, bindings },
  }
}

export function createLinkedUsersApplication() {
  return linkApplication(
    createUsersApplication(),
    artifacts([[UsersController, [UsersService]]]),
  )
}

export function createLinkedEventsApplication() {
  return linkApplication(
    createEventsApplication(),
    artifacts([[EventsController, [EventStreamService]]]),
  )
}

export function createLinkedEventsMessagePortApplication() {
  return linkApplication(
    createEventsMessagePortApplication(),
    artifacts([[EventsMessageHandler, [EventStreamService]]]),
  )
}
