import { cloudflareWorkersRuntime } from '@loutrejs/loutre/runtime/cloudflare-workers'
import usersDefinition from '../dist/conformance/http-crud/application.mjs'
import eventsDefinition from '../dist/conformance/streaming-http/application.mjs'

const users = cloudflareWorkersRuntime.bind({ application: usersDefinition })
const events = cloudflareWorkersRuntime.bind({ application: eventsDefinition })

export default {
  async fetch(request: Request, environment?: unknown, context?: unknown) {
    return new URL(request.url).pathname === '/events'
      ? events.fetch(request, environment, context)
      : users.fetch(request, environment, context)
  },
}
