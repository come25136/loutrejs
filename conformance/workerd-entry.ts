import { createWorkerdFetchHandler } from '@loutrefw/runtime-workerd'
import { createUsersApplication } from '../fixtures/http-crud/src/index.js'
import { createEventsApplication } from '../fixtures/streaming/src/index.js'

const users = createWorkerdFetchHandler(createUsersApplication())
const events = createWorkerdFetchHandler(createEventsApplication())

export default {
  fetch(request: Request) {
    return new URL(request.url).pathname === '/events'
      ? events(request)
      : users(request)
  },
}
