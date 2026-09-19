import { defineApplication, defineModule, inject } from '@loutrejs/loutre'
import { DevtoolsModule } from '@loutrejs/loutre/devtools'
import { http } from '@loutrejs/loutre/http'
import { nodeRuntime } from '@loutrejs/node'
import { createNodeDevtoolsSession } from '../packages/node/src/devtools.js'
import { task, type TasksHostApi } from '@loutrejs/loutre/tasks'
import { WebSocket, WebSocketServer } from 'ws'
import { z } from 'zod'
import {
  DEVTOOLS_PROTOCOL_VERSION,
  startDevServer,
  type DevtoolsGraphSnapshot,
} from '../packages/cli/src/dev/server.js'

const PingContract = http.contract({
  ping: {
    method: 'GET',
    path: '/ping',
    responses: {
      ok: {
        status: 200,
        body: z.object({ ok: z.literal(true) }),
      },
    },
  },
})

const PingController = http.implementation({
  name: 'PingController',
  contract: PingContract,
  factory: () => ({
    ping(ctx) {
      return ctx.response.ok({ body: { ok: true } })
    },
  }),
})

const replayedValues: number[] = []
class ReplayRepository {
  double(value: number): number {
    replayedValues.push(value)
    return value * 2
  }
}

const ReplayTask = task<{ value: number }, number>({
  name: 'devtools-replay',
  factory:
    (repository = inject(ReplayRepository)) =>
    async (input) =>
      repository.double(input.value),
})

const AppModule = defineModule(() => ({
  imports: [DevtoolsModule()],
  providers: [ReplayRepository],
  executions: [PingController, ReplayTask],
}))

const application = defineApplication({ modules: [AppModule()] })

const replayProviderNode = application.model.nodes.find(
  (node) => node.kind === 'provider' && node.token === ReplayRepository,
)
if (!replayProviderNode || replayProviderNode.kind !== 'provider') {
  throw new Error('ReplayRepository provider node was not found.')
}

const snapshot: DevtoolsGraphSnapshot = {
  schemaVersion: DEVTOOLS_PROTOCOL_VERSION,
  nodes: [
    {
      id: replayProviderNode.id,
      kind: 'provider',
      label: 'ReplayRepository',
      source: {
        file: 'tests/devtools-node-runtime.integration.test.ts',
        line: 37,
        column: 7,
      },
    },
  ],
  edges: [],
  diagnostics: [],
}

const devtoolsOrigin = 'https://loutrejs.come25136.id'

async function createDevtoolsFetch(
  endpoint: string,
): Promise<(path: string, init?: RequestInit) => Promise<Response>> {
  const websocket = new WebSocket(endpoint, { origin: devtoolsOrigin })
  await new Promise<void>((resolve, reject) => {
    websocket.once('open', resolve)
    websocket.once('error', reject)
  })

  const request = <T>(method: string, params?: unknown): Promise<T> => {
    const id = crypto.randomUUID()
    return new Promise<T>((resolve, reject) => {
      const onMessage = (data: Buffer) => {
        let message: unknown
        try {
          message = JSON.parse(data.toString())
        } catch {
          return
        }
        if (
          typeof message !== 'object' ||
          message === null ||
          !('type' in message) ||
          message.type !== 'response' ||
          !('id' in message) ||
          message.id !== id ||
          !('ok' in message) ||
          typeof message.ok !== 'boolean'
        ) {
          return
        }
        websocket.off('message', onMessage)
        if (message.ok && 'result' in message) {
          resolve(message.result as T)
          return
        }
        const error = 'error' in message ? message.error : undefined
        reject(
          new Error(
            typeof error === 'object' &&
              error !== null &&
              'message' in error &&
              typeof error.message === 'string'
              ? error.message
              : 'DevTools request failed.',
          ),
        )
      }
      websocket.on('message', onMessage)
      websocket.send(
        JSON.stringify({
          type: 'request',
          id,
          method,
          ...(params === undefined ? {} : { params }),
        }),
      )
    })
  }

  return async (path, init = {}) => {
    const method = init.method ?? 'GET'
    const body =
      typeof init.body === 'string' && init.body.length > 0
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {}
    try {
      let result: unknown
      if (path === '/__loutre/api/v1/traces') {
        result = await request('runtime.traces')
      } else if (path.startsWith('/__loutre/api/v1/traces/')) {
        result = await request('runtime.trace.get', {
          traceId: decodeURIComponent(
            path.slice('/__loutre/api/v1/traces/'.length),
          ),
        })
      } else if (
        path.startsWith('/__loutre/api/v1/capsules/') &&
        path.endsWith('/replay')
      ) {
        const capsuleId = decodeURIComponent(
          path.slice('/__loutre/api/v1/capsules/'.length, -'/replay'.length),
        )
        result = await request('runtime.capsule.replay', {
          capsuleId,
          ...body,
        })
      } else if (
        path.startsWith('/__loutre/api/v1/providers/') &&
        path.endsWith('/playground')
      ) {
        const graphNodeId = decodeURIComponent(
          path.slice(
            '/__loutre/api/v1/providers/'.length,
            -'/playground'.length,
          ),
        )
        result =
          method === 'POST'
            ? await request('runtime.provider.invoke', {
                graphNodeId,
                method: body.method,
                args: body.args,
              })
            : await request('runtime.provider.playground', { graphNodeId })
      } else {
        throw new Error(`Unknown DevTools test path: ${path}`)
      }
      return Response.json(result)
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 503 },
      )
    }
  }
}

describe('Node runtime DevTools bridge', () => {
  it('非JSON化可能なmetadataをdropしてApplication processへ例外を波及させない', async () => {
    const transport = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await new Promise<void>((resolve, reject) => {
      transport.once('listening', resolve)
      transport.once('error', reject)
    })
    const address = transport.address()
    if (!address || typeof address === 'string') {
      throw new Error('Could not resolve DevTools transport address.')
    }
    const previous = {
      endpoint: process.env.LOUTRE_DEV_ENDPOINT,
      runId: process.env.LOUTRE_DEV_RUN_ID,
    }
    process.env.LOUTRE_DEV_ENDPOINT = `ws://127.0.0.1:${address.port}`
    process.env.LOUTRE_DEV_RUN_ID = 'run_transport_safety'
    const messages: Array<Record<string, unknown>> = []
    const connected = new Promise<void>((resolve) => {
      transport.once('connection', (websocket) => {
        websocket.on('message', (data) => {
          const message = JSON.parse(data.toString()) as Record<string, unknown>
          messages.push(message)
        })
        resolve()
      })
    })
    const session = createNodeDevtoolsSession(application)
    if (!session) throw new Error('DevTools session was not created.')

    try {
      await connected
      await vi.waitFor(() => {
        expect(messages).toContainEqual(
          expect.objectContaining({ type: 'hello' }),
        )
      })
      const broken = session.instrumentation.beginExecution({
        executionId: 'transport-broken-metadata',
        executionKind: 'custom',
      })
      const circular: Record<string, unknown> = {}
      circular.self = circular
      broken.annotate?.({ circular })
      broken.complete()
      await new Promise((resolve) => setImmediate(resolve))

      const healthy = session.instrumentation.beginExecution({
        executionId: 'transport-still-alive',
        executionKind: 'custom',
      })
      healthy.complete()

      await vi.waitFor(() => {
        const events = messages.flatMap((message) =>
          Array.isArray(message.events) ? message.events : [],
        ) as Array<Record<string, unknown>>
        expect(events).toContainEqual(
          expect.objectContaining({
            type: 'execution.started',
            executionId: 'transport-still-alive',
          }),
        )
      })
    } finally {
      session.dispose()
      await new Promise<void>((resolve) => transport.close(() => resolve()))
      restoreEnv('LOUTRE_DEV_ENDPOINT', previous.endpoint)
      restoreEnv('LOUTRE_DEV_RUN_ID', previous.runId)
    }
  })

  it('実HTTP executionをApplication channel経由でControl Planeへ送る', async () => {
    const projectRoot = process.cwd()
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => snapshot,
    })
    const previous = {
      endpoint: process.env.LOUTRE_DEV_ENDPOINT,
      runId: process.env.LOUTRE_DEV_RUN_ID,
    }
    process.env.LOUTRE_DEV_ENDPOINT = server.applicationEndpoint
    process.env.LOUTRE_DEV_RUN_ID = 'run_node_test'
    const devtoolsFetch = await createDevtoolsFetch(server.clientEndpoint)

    let app:
      | (Awaited<ReturnType<typeof nodeRuntime.create>> & {
          readonly tasks: TasksHostApi
        })
      | undefined
    try {
      app = await nodeRuntime.create({ application })
      const listener = await app.serve({ port: 0, shutdownHooks: false })
      const address = listener.server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Expected TCP listener address.')
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/ping`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true })

      await vi.waitFor(
        async () => {
          const traces = await devtoolsFetch('/__loutre/api/v1/traces')
          expect(traces.status).toBe(200)
          expect(await traces.json()).toEqual(
            expect.objectContaining({
              traces: expect.arrayContaining([
                expect.objectContaining({
                  runId: expect.stringMatching(/^run_node_test\./),
                  executionId: 'PingController',
                  executionKind: 'http.request',
                  name: 'GET /ping',
                  status: 'ok',
                  attributes: { 'http.status_code': 200 },
                }),
              ]),
            }),
          )
        },
        { timeout: 3_000 },
      )

      let httpHandlerCapsule: string | undefined
      let httpSourceTrace: string | undefined
      await vi.waitFor(
        async () => {
          const tracesResponse = await devtoolsFetch('/__loutre/api/v1/traces')
          const payload = (await tracesResponse.json()) as {
            traces: Array<{ traceId: string; executionKind: string }>
          }
          const trace = payload.traces.find(
            (candidate) => candidate.executionKind === 'http.request',
          )
          expect(trace).toBeDefined()
          const detail = await devtoolsFetch(
            `/__loutre/api/v1/traces/${trace!.traceId}`,
          )
          const detailPayload = (await detail.json()) as {
            events: Array<Record<string, unknown>>
          }
          const handler = detailPayload.events.find(
            (event) =>
              event.type === 'span.started' && event.kind === 'http.handler',
          )
          expect(handler).toMatchObject({
            name: 'PingController.ping',
            replayable: true,
            replayModes: ['direct'],
            input: expect.objectContaining({
              value: expect.objectContaining({ params: {}, query: {} }),
            }),
          })
          const handlerEnd = detailPayload.events.find(
            (event) =>
              event.type === 'span.ended' && event.spanId === handler!.spanId,
          )
          expect(handlerEnd).toMatchObject({
            result: {
              value: {
                kind: 'http-result',
                response: 'ok',
                body: { ok: true },
              },
            },
          })
          httpHandlerCapsule = handler!.capsuleId as string
          httpSourceTrace = trace!.traceId
        },
        { timeout: 3_000 },
      )

      const httpReplay = await devtoolsFetch(
        `/__loutre/api/v1/capsules/${httpHandlerCapsule}/replay`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputOverride: { params: {}, query: {}, headers: {} },
          }),
        },
      )
      expect(httpReplay.status).toBe(200)
      expect(await httpReplay.json()).toMatchObject({
        status: 'ok',
        result: {
          value: { kind: 'http-result', response: 'ok', body: { ok: true } },
        },
      })
      await vi.waitFor(async () => {
        const tracesResponse = await devtoolsFetch('/__loutre/api/v1/traces')
        const payload = (await tracesResponse.json()) as {
          traces: Array<Record<string, unknown>>
        }
        expect(payload.traces).toContainEqual(
          expect.objectContaining({
            executionKind: 'http.handler',
            replayedFromTraceId: httpSourceTrace,
            replayedFromCapsuleId: httpHandlerCapsule,
            status: 'ok',
          }),
        )
      })

      const notFound = await fetch(
        `http://127.0.0.1:${address.port}/missing-resource`,
      )
      expect(notFound.status).toBe(404)
      await expect(notFound.json()).resolves.toEqual({ error: 'Not Found' })
      await vi.waitFor(async () => {
        const tracesResponse = await devtoolsFetch('/__loutre/api/v1/traces')
        const payload = (await tracesResponse.json()) as {
          traces: Array<Record<string, unknown>>
        }
        expect(payload.traces).toContainEqual(
          expect.objectContaining({
            executionId: 'http.not-found',
            executionKind: 'http.request',
            name: 'GET /missing-resource',
            status: 'ok',
            attributes: { 'http.status_code': 404 },
            startedAt: expect.any(Number),
          }),
        )
      })

      const repositoryNode = application.model.nodes.find(
        (node) => node.kind === 'provider' && node.token === ReplayRepository,
      )
      if (!repositoryNode || repositoryNode.kind !== 'provider') {
        throw new Error('ReplayRepository provider node was not found.')
      }
      const playgroundPath = `/__loutre/api/v1/providers/${encodeURIComponent(repositoryNode.id)}/playground`
      const playground = await devtoolsFetch(playgroundPath)
      expect(playground.status).toBe(200)
      expect(await playground.json()).toMatchObject({
        graphNodeId: repositoryNode.id,
        providerName: 'ReplayRepository',
        methods: [{ name: 'double', arity: 1 }],
      })

      const playgroundRun = await devtoolsFetch(playgroundPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ method: 'double', args: [9] }),
      })
      expect(playgroundRun.status).toBe(200)
      const playgroundResult = (await playgroundRun.json()) as {
        status: string
        traceId?: string
        result?: { value?: unknown }
      }
      expect(playgroundResult).toMatchObject({
        status: 'ok',
        traceId: expect.stringMatching(/^trace_/),
        result: { value: 18 },
      })
      expect(replayedValues).toContain(9)
      await vi.waitFor(async () => {
        const tracesResponse = await devtoolsFetch('/__loutre/api/v1/traces')
        const payload = (await tracesResponse.json()) as {
          traces: Array<Record<string, unknown>>
        }
        expect(payload.traces).toContainEqual(
          expect.objectContaining({
            traceId: playgroundResult.traceId,
            executionKind: 'provider.method',
            graphNodeId: repositoryNode.id,
            name: 'ReplayRepository.double',
            status: 'ok',
            replayable: true,
          }),
        )
      })

      replayedValues.length = 0
      await expect(app.tasks.run(ReplayTask, { value: 2 })).resolves.toBe(4)

      let sourceTrace:
        | {
            traceId: string
            capsuleId: string
          }
        | undefined
      await vi.waitFor(
        async () => {
          const tracesResponse = await devtoolsFetch('/__loutre/api/v1/traces')
          const payload = (await tracesResponse.json()) as {
            traces: Array<Record<string, unknown>>
          }
          const trace = payload.traces.find(
            (candidate) => candidate.executionId === 'task.devtools-replay',
          )
          expect(trace).toMatchObject({
            executionKind: 'task.invocation',
            name: 'devtools-replay',
            status: 'ok',
            replayable: true,
            replayModes: ['direct'],
            input: expect.objectContaining({ value: { value: 2 } }),
          })
          expect(typeof trace?.traceId).toBe('string')
          expect(typeof trace?.capsuleId).toBe('string')
          sourceTrace = {
            traceId: trace!.traceId as string,
            capsuleId: trace!.capsuleId as string,
          }
        },
        { timeout: 3_000 },
      )

      const replay = await devtoolsFetch(
        `/__loutre/api/v1/capsules/${sourceTrace!.capsuleId}/replay`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inputOverride: { value: 3 } }),
        },
      )
      expect(replay.status).toBe(200)
      expect(await replay.json()).toMatchObject({
        status: 'ok',
        result: { value: 6 },
      })
      expect(replayedValues).toEqual([2, 3])

      await vi.waitFor(
        async () => {
          const replayTracesResponse = await devtoolsFetch(
            '/__loutre/api/v1/traces',
          )
          const payload = (await replayTracesResponse.json()) as {
            traces: Array<Record<string, unknown>>
          }
          const replayed = payload.traces.find(
            (candidate) =>
              candidate.executionId === 'task.devtools-replay' &&
              candidate.replayedFromTraceId === sourceTrace!.traceId,
          )
          expect(replayed).toMatchObject({
            replayedFromTraceId: sourceTrace!.traceId,
            replayedFromCapsuleId: sourceTrace!.capsuleId,
            status: 'ok',
          })
        },
        { timeout: 3_000 },
      )

      const sourceDetail = await devtoolsFetch(
        `/__loutre/api/v1/traces/${sourceTrace!.traceId}`,
      )
      const sourceEvents = (await sourceDetail.json()) as {
        events: Array<Record<string, unknown>>
      }
      const taskEnd = sourceEvents.events.find(
        (event) => event.type === 'execution.ended',
      )
      expect(taskEnd).toMatchObject({ result: { value: 4 } })

      const repositorySpan = sourceEvents.events.find(
        (event) =>
          event.type === 'span.started' &&
          event.kind === 'provider.method' &&
          event.name === 'ReplayRepository.double',
      )
      expect(repositorySpan).toMatchObject({
        input: expect.objectContaining({ value: [2] }),
        replayable: true,
        replayModes: ['direct'],
      })
      const repositoryEnd = sourceEvents.events.find(
        (event) =>
          event.type === 'span.ended' &&
          event.spanId === repositorySpan!.spanId,
      )
      expect(repositoryEnd).toMatchObject({ result: { value: 4 } })
      const providerCapsuleId = repositorySpan!.capsuleId as string
      expect(providerCapsuleId).toEqual(expect.any(String))

      const providerReplay = await devtoolsFetch(
        `/__loutre/api/v1/capsules/${providerCapsuleId}/replay`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inputOverride: [5] }),
        },
      )
      expect(providerReplay.status).toBe(200)
      expect(await providerReplay.json()).toMatchObject({
        status: 'ok',
        result: { value: 10 },
      })
      expect(replayedValues).toEqual([2, 3, 5])

      await vi.waitFor(async () => {
        const providerTracesResponse = await devtoolsFetch(
          '/__loutre/api/v1/traces',
        )
        const payload = (await providerTracesResponse.json()) as {
          traces: Array<Record<string, unknown>>
        }
        expect(payload.traces).toContainEqual(
          expect.objectContaining({
            executionKind: 'provider.method',
            name: 'ReplayRepository.double',
            replayedFromTraceId: sourceTrace!.traceId,
            replayedFromCapsuleId: providerCapsuleId,
            status: 'ok',
          }),
        )
      })
    } finally {
      await app?.close().catch(() => undefined)
      await server.close()
      restoreEnv('LOUTRE_DEV_ENDPOINT', previous.endpoint)
      restoreEnv('LOUTRE_DEV_RUN_ID', previous.runId)
    }
  })
})

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
