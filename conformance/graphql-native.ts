import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import { denoRuntime } from '@loutrejs/loutre/runtime/deno'
import { graphQLConformanceApplication } from './graphql-application.js'
import { verifyGraphQLTransports } from './graphql-client.js'

const runtime = 'Bun' in globalThis ? bunRuntime : denoRuntime
for (const http of [true, false]) {
  const application = await runtime.create({
    application: graphQLConformanceApplication(http),
  })
  const port = http ? 28190 : 28191
  try {
    await application.serve({
      port,
      hostname: '127.0.0.1',
      shutdownHooks: false,
    })
    await verifyGraphQLTransports(
      `http://127.0.0.1:${port}/graphql`,
      http,
      () => application.close(),
    )
  } finally {
    await application.close()
  }
}
console.log(`${runtime.runtime} GraphQL HTTP/WebSocket conformance: passed`)
