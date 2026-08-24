import { createWorkerdFetchHandler } from '@loutrefw/runtime-workerd'
import usersApplication from '../dist/conformance/http-crud/application.mjs'
import eventsApplication from '../dist/conformance/streaming-http/application.mjs'

const users = createWorkerdFetchHandler(usersApplication)
const events = createWorkerdFetchHandler(eventsApplication)

export default {
  fetch(request: Request) {
    return new URL(request.url).pathname === '/events'
      ? events(request)
      : users(request)
  },
}
