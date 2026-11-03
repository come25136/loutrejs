import { createServer } from 'node:http'
import { parse } from 'graphql'
import { createClient } from 'graphql-ws'
import WebSocket from 'ws'
import {
  defineApplication,
  defineModule,
  syntheticExecutionId,
} from '@loutrejs/loutre'
import { DevtoolsModule } from '@loutrejs/loutre/devtools'
import { http } from '@loutrejs/loutre/http'
import { graphql } from '@loutrejs/graphql'
import { bindManifest } from '@loutrejs/graphql/runtime'
import { nodeRuntime } from '@loutrejs/node'
import { createNodeDevtoolsSession } from '../packages/node/src/devtools.js'
import {
  attachApplicationChannel,
  DEVTOOLS_APPLICATION_CHANNEL_PATH,
} from '../packages/cli/src/dev/application-channel.js'
import { DevtoolsEventStore } from '../packages/cli/src/dev/event-store.js'

const manifest = bindManifest({
  schemaDocument: parse('type Query { hello: String! }'),
  resolvers: { Query: { hello: () => 'Hello' } },
})
const endpoint = graphql.implementation({
  name: 'ObservedGraphQL',
  route: http.contract({
    graphql: { raw: true, method: '*', path: '/graphql' },
  }).routes.graphql,
  manifest,
  transports: { http: false, websocket: true },
  factory: () => ({ context: () => ({}) }),
})
const application = defineApplication({
  modules: [
    defineModule({ imports: [DevtoolsModule()], executions: [endpoint] }),
  ],
})

async function startChannel() {
  const server = createServer()
  const eventStore = new DevtoolsEventStore()
  const channel = attachApplicationChannel(server, { eventStore })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Expected TCP listener.')
  vi.stubGlobal('WebSocket', WebSocket)
  vi.stubEnv(
    'LOUTRE_DEV_ENDPOINT',
    `ws://127.0.0.1:${address.port}${DEVTOOLS_APPLICATION_CHANNEL_PATH}`,
  )
  vi.stubEnv('LOUTRE_DEV_RUN_ID', 'run_operation_channel')
  return {
    eventStore,
    async close() {
      try {
        await channel.close()
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        )
      } finally {
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
      }
    },
  }
}

it('実GraphQL WSのoperationをApplication channelへ送り、終了後もDevTools接続を維持する', async () => {
  const channel = await startChannel()
  let app: Awaited<ReturnType<typeof nodeRuntime.create>> | undefined
  let client: ReturnType<typeof createClient> | undefined
  try {
    app = await nodeRuntime.create({ application })
    const listener = await app.serve({
      port: 0,
      hostname: '127.0.0.1',
      shutdownHooks: false,
    })
    client = createClient({
      url: `ws://127.0.0.1:${listener.port}/graphql`,
      webSocketImpl: WebSocket,
      retryAttempts: 0,
    })
    for (let index = 0; index < 2; index++) {
      const result = client.iterate({ query: '{ hello }' })
      try {
        expect((await result.next()).value).toEqual({
          data: { hello: 'Hello' },
        })
        expect((await result.next()).done).toBe(true)
      } finally {
        await result.return?.()
      }
    }
    await vi.waitFor(() => {
      const events = channel.eventStore.listEvents()
      const operations = events.filter(
        (event) =>
          event.type === 'span.started' && event.kind === 'graphql.operation',
      )
      expect(operations).toHaveLength(2)
      for (const operation of operations) {
        expect(events).toContainEqual(
          expect.objectContaining({
            type: 'span.ended',
            spanId: operation.spanId,
            status: 'ok',
          }),
        )
      }
      expect(channel.eventStore.listRuns()).toHaveLength(1)
      expect(channel.eventStore.listRuns()[0]?.stoppedAt).toBeUndefined()
    })
  } finally {
    await client?.dispose()
    await app?.close()
    await channel.close()
  }
})

it('独自operationの生成イベントをApplication channelへ送り、後続のexecutionも受信する', async () => {
  const channel = await startChannel()
  const session = createNodeDevtoolsSession(application)
  try {
    if (!session) throw new Error('DevTools session was not created.')
    const root = session.instrumentation.beginExecution({
      executionId: syntheticExecutionId('extension.root'),
      executionKind: 'custom',
    })
    root.run?.(() =>
      session.instrumentation
        .beginOperation({
          kind: 'custom.extension.operation',
          name: 'custom operation',
        })
        ?.complete(),
    )
    root.complete()
    const next = session.instrumentation.beginExecution({
      executionId: syntheticExecutionId('extension.next'),
      executionKind: 'custom',
    })
    next.complete()
    await vi.waitFor(() => {
      const events = channel.eventStore.listEvents()
      const operation = events.find(
        (event) =>
          event.type === 'span.started' &&
          event.kind === 'custom.extension.operation',
      )
      expect(operation).toBeDefined()
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'span.ended',
          spanId: operation?.spanId,
          status: 'ok',
        }),
      )
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'execution.ended',
          executionId: 'extension.next',
          status: 'ok',
        }),
      )
      expect(channel.eventStore.listRuns()).toHaveLength(1)
      expect(channel.eventStore.listRuns()[0]?.stoppedAt).toBeUndefined()
    })
  } finally {
    session?.dispose()
    await channel.close()
  }
})
