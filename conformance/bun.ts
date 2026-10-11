import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import usersDefinition from '../dist/conformance/http-crud/application.mjs'
import eventsDefinition from '../dist/conformance/streaming-http/application.mjs'

const usersPort = 28743
const eventsPort = 28744
const users = await bunRuntime.create({ application: usersDefinition })
await users.serve({ port: usersPort })
try {
  const response = await fetch(`http://127.0.0.1:${usersPort}/users/bun-user`)
  const body = (await response.json()) as {
    readonly id?: string
    readonly name?: string
  }
  if (
    response.status !== 200 ||
    body.id !== 'bun-user' ||
    body.name !== 'test'
  ) {
    throw new Error(`Bun conformance failed: ${JSON.stringify(body)}`)
  }
} finally {
  await users.close()
}

const events = await bunRuntime.create({ application: eventsDefinition })
await events.serve({ port: eventsPort })
try {
  const streamResponse = await fetch(`http://127.0.0.1:${eventsPort}/events`)
  const streamBody = await streamResponse.text()
  if (streamResponse.status !== 200 || !streamBody.includes('"sequence":3')) {
    throw new Error(
      `Bun server-stream conformance failed: ${streamResponse.status} ${streamBody}`,
    )
  }
} finally {
  await events.close()
}
const bunVersion =
  (
    globalThis as typeof globalThis & {
      readonly Bun?: { readonly version?: string }
    }
  ).Bun?.version ?? 'unknown'
console.log(`Bun ${bunVersion} conformance: passed`)
