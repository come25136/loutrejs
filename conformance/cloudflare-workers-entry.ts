import { graphQLConformanceApplication } from './graphql-application.js'
import { cloudflareWorkersRuntime } from '@loutrejs/loutre/runtime/cloudflare-workers'
import usersDefinition from '../dist/conformance/http-crud/application.mjs'
import eventsDefinition from '../dist/conformance/streaming-http/application.mjs'

const users = cloudflareWorkersRuntime.bind({ application: usersDefinition })
const events = cloudflareWorkersRuntime.bind({ application: eventsDefinition })

const graphql = cloudflareWorkersRuntime.bind({
  application: graphQLConformanceApplication(),
})
const websocketOnly = cloudflareWorkersRuntime.bind({
  application: graphQLConformanceApplication(false, '/ws-only'),
})

export default {
  async fetch(request: Request, environment?: unknown, context?: unknown) {
    const path = new URL(request.url).pathname
    if (path === '/graphql' || path === '/commerce')
      return graphql.fetch(request, environment, context)
    if (path === '/ws-only' || path === '/commerce-ws-only')
      return websocketOnly.fetch(request, environment, context)
    if (path === '/shutdown') {
      await (new URL(request.url).searchParams.has('http')
        ? graphql.close()
        : websocketOnly.close())
      return new Response('closed')
    }
    return new URL(request.url).pathname === '/events'
      ? events.fetch(request, environment, context)
      : users.fetch(request, environment, context)
  },
}
