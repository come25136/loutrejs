import { defineApplication, defineModule } from '@loutrejs/loutre'
import {
  ApplicationShutdownError,
  SilentLogger,
} from '@loutrejs/loutre/runtime'
import { http } from '@loutrejs/loutre/http'
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
class BrokenShutdown {
  onApplicationShutdown() {
    throw new Error('conformance shutdown failure')
  }
}
const shutdownContract = http.contract({
  health: {
    method: 'GET',
    path: '/health',
    responses: { ok: { status: 204 } },
  },
})
const shutdownController = http.implementation({
  contract: shutdownContract,
  factory: () => ({ health: (context) => context.response.ok({}) }),
})
const failing = await bunRuntime.create({
  application: defineApplication({
    modules: [
      defineModule({
        providers: [BrokenShutdown],
        executions: [shutdownController],
      }),
    ],
    logger: new SilentLogger(),
  }),
})
const failingListener = await failing.serve({
  port: 0,
  hostname: '127.0.0.1',
  shutdownHooks: false,
})
try {
  const failure = await failing
    .close('SIGTERM')
    .catch((error: unknown) => error)
  if (
    !(failure instanceof AggregateError) ||
    !(failure.errors[0] instanceof ApplicationShutdownError) ||
    !failure.errors[0].safeCleanupBoundaryReached
  ) {
    throw new Error(
      'Bunはcleanup境界到達後のlifecycle失敗を報告する必要があります',
    )
  }
  const reachable = await fetch(
    `http://127.0.0.1:${failingListener.port}/health`,
  ).then(
    () => true,
    () => false,
  )
  if (reachable)
    throw new Error(
      'Bunはlifecycle失敗後もHTTP listenerを停止する必要があります',
    )
  const reServeError = await failing
    .serve({ port: 0 })
    .catch((error: unknown) => error)
  if (
    !(reServeError instanceof Error) ||
    !reServeError.message.includes('LUTRE_APP_STOPPED')
  ) {
    throw new Error('Bunは終了失敗後のserveを拒否する必要があります')
  }
} finally {
  await failing.close()
}

const bunVersion =
  (
    globalThis as typeof globalThis & {
      readonly Bun?: { readonly version?: string }
    }
  ).Bun?.version ?? 'unknown'
console.log(`Bun ${bunVersion} conformance: passed`)
