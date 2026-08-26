import { createInvocationBinding } from '@loutrejs/application/binding'
import { createWorkerdFetchDriver } from '@loutrejs/runtime-workerd'
import usersDefinition from '../dist/conformance/http-crud/application.mjs'
import eventsDefinition from '../dist/conformance/streaming-http/application.mjs'

const usersBinding = createInvocationBinding(usersDefinition)
const eventsBinding = createInvocationBinding(eventsDefinition)
const users = createWorkerdFetchDriver(usersBinding.http!)
const events = createWorkerdFetchDriver(eventsBinding.http!)

export default {
  async fetch(request: Request) {
    return new URL(request.url).pathname === '/events'
      ? events(request)
      : users(request)
  },
}
