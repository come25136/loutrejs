import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocket, type ClientOptions } from 'ws'
import {
  DEVTOOLS_PROTOCOL_VERSION,
  startDevServer,
  type DevtoolsGraphSnapshot,
  type DevServer,
} from '../packages/cli/src/dev/server.js'

const officialOrigin = 'https://loutrejs.come25136.id'

interface ControlClient {
  readonly websocket: WebSocket
  request<T = unknown>(method: string, params?: unknown): Promise<T>
  nextEvent(event: string): Promise<unknown>
  close(): void
}

async function connectControl(
  server: DevServer,
  origin?: string,
): Promise<ControlClient> {
  const websocket = new WebSocket(
    server.clientEndpoint,
    origin === undefined ? {} : { origin },
  )
  const hello = new Promise<void>((resolve, reject) => {
    const onMessage = (data: Buffer) => {
      let message: unknown
      try {
        message = JSON.parse(data.toString())
      } catch {
        return
      }
      if (!isRecord(message) || message.type !== 'hello') return
      websocket.off('message', onMessage)
      if (message.protocolVersion !== DEVTOOLS_PROTOCOL_VERSION) {
        reject(
          new Error(
            `Unexpected DevTools protocol version: ${String(message.protocolVersion)}`,
          ),
        )
        return
      }
      resolve()
    }
    websocket.on('message', onMessage)
  })
  await new Promise<void>((resolve, reject) => {
    websocket.once('open', resolve)
    websocket.once('error', reject)
  })
  await hello
  return {
    websocket,
    request<T>(method: string, params?: unknown): Promise<T> {
      const id = crypto.randomUUID()
      return new Promise<T>((resolve, reject) => {
        const onMessage = (data: Buffer) => {
          let message: unknown
          try {
            message = JSON.parse(data.toString())
          } catch {
            return
          }
          if (!isRecord(message) || message.type !== 'response') return
          if (message.id !== id || typeof message.ok !== 'boolean') return
          websocket.off('message', onMessage)
          if (message.ok) {
            resolve(message.result as T)
            return
          }
          const error = message.error
          reject(
            new Error(
              isRecord(error) && typeof error.message === 'string'
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
    },
    nextEvent(event: string): Promise<unknown> {
      return new Promise((resolve) => {
        const onMessage = (data: Buffer) => {
          let message: unknown
          try {
            message = JSON.parse(data.toString())
          } catch {
            return
          }
          if (
            !isRecord(message) ||
            message.type !== 'event' ||
            message.event !== event
          ) {
            return
          }
          websocket.off('message', onMessage)
          resolve(message.payload)
        }
        websocket.on('message', onMessage)
      })
    },
    close() {
      websocket.close()
    },
  }
}

async function expectWebSocketRejected(
  endpoint: string,
  options: ClientOptions = {},
): Promise<void> {
  const websocket = new WebSocket(endpoint, options)
  await new Promise<void>((resolve, reject) => {
    websocket.once('open', () =>
      reject(new Error('WebSocket unexpectedly connected')),
    )
    websocket.once('error', () => resolve())
    websocket.once('close', () => resolve())
  })
  websocket.terminate()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

describe('Loutre Devtools control channel', () => {
  let projectRoot: string

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'loutre-devtools-api-'))
  })

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true })
  })

  function snapshot(label = 'AppModule'): DevtoolsGraphSnapshot {
    return {
      schemaVersion: DEVTOOLS_PROTOCOL_VERSION,
      nodes: [{ id: 'module:1', kind: 'module', label }],
      edges: [],
      diagnostics: [],
    }
  }

  it('許可した公式サイトへ単一WebSocketでGraph Snapshotを公開する', async () => {
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => snapshot(),
    })
    const client = await connectControl(server, officialOrigin)
    try {
      const state = await client.request<{
        revision: number
        snapshot: DevtoolsGraphSnapshot
      }>('graph.get')
      expect(state.revision).toBe(1)
      expect(state.snapshot).toEqual(snapshot())
    } finally {
      client.close()
      await server.close()
    }
  })

  it('local website devの3100番Originを許可する', async () => {
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => snapshot(),
    })
    try {
      for (const origin of ['http://localhost:3100', 'http://127.0.0.1:3100']) {
        const client = await connectControl(server, origin)
        expect(await client.request('graph.get')).toEqual(
          expect.objectContaining({ snapshot: snapshot() }),
        )
        client.close()
      }
    } finally {
      await server.close()
    }
  })

  it('許可していないBrowser OriginのWebSocketを拒否する', async () => {
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => snapshot(),
    })
    try {
      await expectWebSocketRejected(server.clientEndpoint, {
        origin: 'https://example.com',
      })
    } finally {
      await server.close()
    }
  })

  it('未知のWebSocket upgrade pathはsocketを残さず拒否する', async () => {
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => snapshot(),
    })
    try {
      const endpoint = new URL(server.clientEndpoint)
      endpoint.pathname = '/__loutre/unknown'
      await expectWebSocketRejected(endpoint.toString())
    } finally {
      await server.close()
    }
  })

  it('Agent/native clientはOriginなしでloopback control channelへ接続できる', async () => {
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => snapshot(),
    })
    const client = await connectControl(server)
    try {
      expect(await client.request('graph.get')).toEqual(
        expect.objectContaining({ snapshot: snapshot() }),
      )
    } finally {
      client.close()
      await server.close()
    }
  })

  it('loopback以外のHost headerをWebSocket control channelで拒否する', async () => {
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => snapshot(),
    })
    try {
      await expectWebSocketRejected(server.clientEndpoint, {
        origin: officialOrigin,
        headers: { Host: `localhost:${server.port}` },
      })
    } finally {
      await server.close()
    }
  })

  it('Browser control channelはtoken/handshakeなしでRPCできる', async () => {
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => snapshot(),
    })
    const client = await connectControl(server, officialOrigin)
    try {
      const state = await client.request('graph.get')
      expect(state).toEqual(expect.objectContaining({ revision: 1 }))
    } finally {
      client.close()
      await server.close()
    }
  })

  it('再buildに失敗しても直前のSnapshotをerrorと一緒に保持する', async () => {
    let failure = false
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => {
        if (failure) throw new Error('fixture build failed')
        return snapshot()
      },
    })
    const client = await connectControl(server)
    try {
      failure = true
      const event = client.nextEvent('graph.state')
      const state = await client.request<{
        error?: string
        snapshot?: DevtoolsGraphSnapshot
      }>('graph.reload')
      expect(state).toEqual(
        expect.objectContaining({
          error: 'fixture build failed',
          snapshot: snapshot(),
        }),
      )
      expect(await event).toEqual(
        expect.objectContaining({ error: 'fixture build failed' }),
      )
    } finally {
      client.close()
      await server.close()
    }
  })

  it('source変更後のGraph reload失敗時は再起動hookを呼ばない', async () => {
    const source = join(projectRoot, 'source.ts')
    await writeFile(source, 'export const value = 1\n', 'utf8')
    let failure = false
    let builds = 0
    let successfulReloads = 0
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      onSourceGraphReload: () => {
        successfulReloads += 1
      },
      loadGraph: async () => {
        builds += 1
        if (failure) throw new Error('fixture build failed')
        return { snapshot: snapshot(), watchFiles: [source] }
      },
    })
    try {
      failure = true
      await writeFile(source, 'export const value = 2\n', 'utf8')
      await vi.waitFor(() => expect(builds).toBeGreaterThan(1), {
        timeout: 3_000,
      })
      await new Promise((resolve) => setTimeout(resolve, 250))
      expect(successfulReloads).toBe(0)

      failure = false
      await writeFile(source, 'export const value = 3\n', 'utf8')
      await vi.waitFor(() => expect(successfulReloads).toBe(1), {
        timeout: 3_000,
      })
    } finally {
      await server.close()
    }
  })

  it('reload失敗後は新規missing dependencyの作成でも再buildして復旧する', async () => {
    const entry = join(projectRoot, 'src', 'app.ts')
    const dependency = join(projectRoot, 'src', 'new-dependency.ts')
    await mkdir(join(projectRoot, 'src'), { recursive: true })
    await writeFile(entry, 'export {}\n', 'utf8')
    let builds = 0
    let requiresDependency = false
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => {
        builds += 1
        if (requiresDependency) {
          await readFile(dependency, 'utf8')
        }
        return { snapshot: snapshot(), watchFiles: [entry, dependency] }
      },
    })
    try {
      requiresDependency = true
      await writeFile(entry, 'export const broken = true\n', 'utf8')
      await vi.waitFor(() => expect(builds).toBeGreaterThan(1), {
        timeout: 3_000,
      })
      const failedBuilds = builds

      await writeFile(dependency, 'export const ready = true\n', 'utf8')
      await vi.waitFor(() => expect(builds).toBeGreaterThan(failedBuilds), {
        timeout: 3_000,
      })
    } finally {
      await server.close()
    }
  })

  it('projectのsource変更後にGraphを自動で再buildする', async () => {
    let builds = 0
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => snapshot(`AppModule:${++builds}`),
    })
    const client = await connectControl(server)
    try {
      await writeFile(join(projectRoot, 'source.ts'), 'export {}\n', 'utf8')
      await vi.waitFor(
        async () => {
          const state = await client.request<{ revision: number }>('graph.get')
          expect(state.revision).toBeGreaterThan(1)
          expect(builds).toBeGreaterThan(1)
        },
        { timeout: 3_000 },
      )
    } finally {
      client.close()
      await server.close()
    }
  })

  it('dependency-aware watch対象が0件でもserverは起動する', async () => {
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => ({ snapshot: snapshot(), watchFiles: [] }),
    })
    const client = await connectControl(server)
    try {
      expect(await client.request('graph.get')).toEqual(
        expect.objectContaining({ snapshot: snapshot() }),
      )
    } finally {
      client.close()
      await server.close()
    }
  })

  it('dependency-aware watchではreachable fileだけGraphをrebuildする', async () => {
    const source = join(projectRoot, 'src', 'app.ts')
    const unrelated = join(projectRoot, 'notes.md')
    await mkdir(join(projectRoot, 'src'), { recursive: true })
    await writeFile(source, 'export {}\n', 'utf8')
    await writeFile(unrelated, 'notes\n', 'utf8')
    let builds = 0
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => ({
        snapshot: snapshot(`AppModule:${++builds}`),
        watchFiles: [source],
      }),
    })
    try {
      await writeFile(unrelated, 'changed\n', 'utf8')
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(builds).toBe(1)

      await writeFile(source, 'export const changed = true\n', 'utf8')
      await vi.waitFor(() => expect(builds).toBeGreaterThan(1), {
        timeout: 3_000,
      })
    } finally {
      await server.close()
    }
  })

  it('Graph reload後に新しいreachable fileをwatch対象へ追加する', async () => {
    const entry = join(projectRoot, 'src', 'app.ts')
    const dependency = join(projectRoot, 'src', 'dependency.ts')
    await mkdir(join(projectRoot, 'src'), { recursive: true })
    await writeFile(entry, 'export {}\n', 'utf8')
    await writeFile(dependency, 'export const value = 1\n', 'utf8')
    let builds = 0
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => {
        builds += 1
        return {
          snapshot: snapshot(`AppModule:${builds}`),
          watchFiles: builds === 1 ? [entry] : [entry, dependency],
        }
      },
    })
    try {
      await writeFile(entry, 'export const changed = true\n', 'utf8')
      await vi.waitFor(() => expect(builds).toBeGreaterThanOrEqual(2), {
        timeout: 3_000,
      })
      const afterEntry = builds
      await writeFile(dependency, 'export const value = 2\n', 'utf8')
      await vi.waitFor(() => expect(builds).toBeGreaterThan(afterEntry), {
        timeout: 3_000,
      })
    } finally {
      await server.close()
    }
  })

  it('既定ignore directoryの変更ではGraphをrebuildしない', async () => {
    await mkdir(join(projectRoot, '.git', 'objects'), { recursive: true })
    let builds = 0
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => snapshot(`AppModule:${++builds}`),
    })
    try {
      await new Promise((resolve) => setTimeout(resolve, 100))
      await writeFile(
        join(projectRoot, '.git', 'objects', 'maintenance.lock'),
        'ignored\n',
        'utf8',
      )
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(builds).toBe(1)
    } finally {
      await server.close()
    }
  })

  it('追加ignore pathの変更ではGraphをrebuildしない', async () => {
    await mkdir(join(projectRoot, 'generated', 'nested'), { recursive: true })
    let builds = 0
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      ignore: ['generated'],
      loadGraph: async () => snapshot(`AppModule:${++builds}`),
    })
    try {
      await new Promise((resolve) => setTimeout(resolve, 100))
      await writeFile(
        join(projectRoot, 'generated', 'nested', 'schema.ts'),
        'ignored\n',
        'utf8',
      )
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(builds).toBe(1)
    } finally {
      await server.close()
    }
  })

  it('Application eventを同じcontrol WebSocketのTrace RPCとpushで公開する', async () => {
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => snapshot(),
    })
    const client = await connectControl(server, officialOrigin)
    const application = new WebSocket(server.applicationEndpoint)
    try {
      await new Promise<void>((resolve, reject) => {
        application.once('open', resolve)
        application.once('error', reject)
      })
      const runtimeConnected = client.nextEvent('runtime.snapshot')
      application.send(
        JSON.stringify({
          type: 'hello',
          protocolVersion: DEVTOOLS_PROTOCOL_VERSION,
          runId: 'run_test',
          application: { runtime: 'node', pid: 1234 },
        }),
      )

      expect(await runtimeConnected).toEqual([])

      const runtimeEvent = client.nextEvent('runtime.batch')
      application.send(
        JSON.stringify({
          type: 'event.batch',
          runId: 'run_test',
          events: [
            {
              type: 'execution.started',
              runId: 'run_test',
              seq: 1,
              timestamp: 1_000,
              traceId: 'trace_test',
              spanId: 'span_test',
              executionId: 'UsersController',
              executionKind: 'http.request',
              name: 'GET /users/{id}',
            },
            {
              type: 'execution.ended',
              runId: 'run_test',
              seq: 2,
              timestamp: 1_025,
              traceId: 'trace_test',
              spanId: 'span_test',
              executionId: 'UsersController',
              durationMs: 25,
              status: 'ok',
            },
          ],
        }),
      )

      expect(await runtimeEvent).toHaveLength(2)
      await vi.waitFor(async () => {
        const payload = await client.request<{ traces: unknown[] }>(
          'runtime.traces',
        )
        expect(payload.traces).toEqual([
          expect.objectContaining({
            traceId: 'trace_test',
            durationMs: 25,
            status: 'ok',
          }),
        ])
      })

      const detail = await client.request<{ events: unknown[] }>(
        'runtime.trace.get',
        { traceId: 'trace_test' },
      )
      expect(detail.events).toHaveLength(2)

      const clearedEvent = client.nextEvent('runtime.snapshot')
      expect(await client.request('runtime.traces.clear')).toEqual({
        cleared: 2,
      })
      expect(await clearedEvent).toEqual([])
      expect(await client.request('runtime.traces')).toEqual({ traces: [] })
    } finally {
      application.close()
      client.close()
      await server.close()
    }
  })

  it('同じrunIdのApplication接続を置換しても旧socketのcloseで新runを停止しない', async () => {
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => snapshot(),
    })
    const client = await connectControl(server)
    const first = new WebSocket(server.applicationEndpoint)
    let second: WebSocket | undefined
    try {
      await new Promise<void>((resolve, reject) => {
        first.once('open', resolve)
        first.once('error', reject)
      })
      first.send(
        JSON.stringify({
          type: 'hello',
          protocolVersion: DEVTOOLS_PROTOCOL_VERSION,
          runId: 'run_shared',
          application: { runtime: 'node', pid: 1001 },
        }),
      )
      await vi.waitFor(async () => {
        const payload = await client.request<{
          runs: Array<{ runId: string; stoppedAt?: number }>
        }>('runtime.runs')
        expect(payload.runs[0]).toMatchObject({ runId: 'run_shared' })
        expect(payload.runs[0]?.stoppedAt).toBeUndefined()
      })

      second = new WebSocket(server.applicationEndpoint)
      await new Promise<void>((resolve, reject) => {
        second!.once('open', resolve)
        second!.once('error', reject)
      })
      second.send(
        JSON.stringify({
          type: 'hello',
          protocolVersion: DEVTOOLS_PROTOCOL_VERSION,
          runId: 'run_shared',
          application: { runtime: 'node', pid: 1002 },
        }),
      )

      await vi.waitFor(async () => {
        expect(first.readyState).toBe(WebSocket.CLOSED)
        const payload = await client.request<{
          runs: Array<{
            runId: string
            stoppedAt?: number
            application: { pid?: number }
          }>
        }>('runtime.runs')
        expect(payload.runs).toHaveLength(1)
        expect(payload.runs[0]).toMatchObject({
          runId: 'run_shared',
          application: { pid: 1002 },
        })
        expect(payload.runs[0]?.stoppedAt).toBeUndefined()
      })
    } finally {
      first.close()
      second?.close()
      client.close()
      await server.close()
    }
  })

  it('Application再接続時は旧runをstoppedにして新しいrunを保持する', async () => {
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => snapshot(),
    })
    const client = await connectControl(server)
    const first = new WebSocket(server.applicationEndpoint)
    try {
      await new Promise<void>((resolve, reject) => {
        first.once('open', resolve)
        first.once('error', reject)
      })
      first.send(
        JSON.stringify({
          type: 'hello',
          protocolVersion: DEVTOOLS_PROTOCOL_VERSION,
          runId: 'run_first',
          application: { runtime: 'node', pid: 1001 },
        }),
      )
      await vi.waitFor(async () => {
        const payload = await client.request<{
          runs: Array<{ runId: string; stoppedAt?: number }>
        }>('runtime.runs')
        expect(payload.runs).toEqual([
          expect.objectContaining({ runId: 'run_first' }),
        ])
        expect(payload.runs[0]?.stoppedAt).toBeUndefined()
      })

      first.close()
      await vi.waitFor(async () => {
        const payload = await client.request<{
          runs: Array<{ runId: string; stoppedAt?: number }>
        }>('runtime.runs')
        expect(payload.runs[0]?.runId).toBe('run_first')
        expect(payload.runs[0]?.stoppedAt).toEqual(expect.any(Number))
      })

      const second = new WebSocket(server.applicationEndpoint)
      try {
        await new Promise<void>((resolve, reject) => {
          second.once('open', resolve)
          second.once('error', reject)
        })
        second.send(
          JSON.stringify({
            type: 'hello',
            protocolVersion: DEVTOOLS_PROTOCOL_VERSION,
            runId: 'run_second',
            application: { runtime: 'node', pid: 1002 },
          }),
        )
        await vi.waitFor(async () => {
          const payload = await client.request<{
            runs: Array<{ runId: string; stoppedAt?: number }>
          }>('runtime.runs')
          expect(payload.runs).toHaveLength(2)
          const firstRun = payload.runs.find((run) => run.runId === 'run_first')
          const secondRun = payload.runs.find(
            (run) => run.runId === 'run_second',
          )
          expect(firstRun?.stoppedAt).toEqual(expect.any(Number))
          expect(secondRun?.stoppedAt).toBeUndefined()
        })
      } finally {
        second.close()
      }
    } finally {
      first.close()
      client.close()
      await server.close()
    }
  })

  it('1本のcontrol WebSocketでGraphとRuntime RPCを多重化する', async () => {
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => snapshot(),
    })
    const client = await connectControl(server, officialOrigin)
    try {
      expect(client.websocket.readyState).toBe(WebSocket.OPEN)
      expect(await client.request('graph.get')).toEqual(
        expect.objectContaining({ snapshot: snapshot() }),
      )
      expect(await client.request('runtime.runs')).toEqual({ runs: [] })
      expect(await client.request('runtime.traces')).toEqual({ traces: [] })
      expect(client.websocket.readyState).toBe(WebSocket.OPEN)
    } finally {
      client.close()
      await server.close()
    }
  })

  it('Application channelはbrowser Origin付きWebSocketを拒否する', async () => {
    const server = await startDevServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => snapshot(),
    })
    try {
      await expectWebSocketRejected(server.applicationEndpoint, {
        origin: officialOrigin,
      })
    } finally {
      await server.close()
    }
  })
})
