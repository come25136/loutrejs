import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import usersDefinition from '../dist/conformance/http-crud/application.mjs'
import eventsDefinition from '../dist/conformance/streaming-http/application.mjs'

const eventsPort = 28744
const users = await bunRuntime.create({ application: usersDefinition })
const startupOutput: string[] = []
const originalLog = console.log
try {
  console.log = (message) => {
    startupOutput.push(String(message))
    originalLog(message)
  }
  const listener = await users.serve({
    port: 0,
    hostname: '127.0.0.1',
    shutdownHooks: false,
  })
  if (
    listener.port <= 0 ||
    !startupOutput.some((line) =>
      line.includes(`Server: http://127.0.0.1:${listener.port}`),
    )
  ) {
    throw new Error(`Bunの実portとReadyログが一致しません: ${listener.port}`)
  }
  const response = await fetch(
    `http://127.0.0.1:${listener.port}/users/bun-user`,
  )
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
  console.log = originalLog
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
