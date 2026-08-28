import { createInvocationBinding } from '@loutrejs/application/binding'
import { createWorkerdFetchDriver } from '@loutrejs/runtime-workerd'
import usersDefinition from '../dist/conformance/http-crud/application.mjs'
import eventsDefinition from '../dist/conformance/streaming-http/application.mjs'

const usersBinding = createInvocationBinding({ application: usersDefinition })
const eventsBinding = createInvocationBinding({ application: eventsDefinition })
const users = createWorkerdFetchDriver(usersBinding.http!)
const events = createWorkerdFetchDriver(eventsBinding.http!)

export default {
  async fetch(request: Request) {
    return new URL(request.url).pathname === '/events'
      ? events(request)
      : users(request)
  },
}
