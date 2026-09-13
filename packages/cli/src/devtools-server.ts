import { watch, type FSWatcher } from 'node:fs'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { basename, normalize } from 'node:path'

export const DEVTOOLS_PROTOCOL_VERSION = 1
export const DEFAULT_DEVTOOLS_PORT = 4545
export const DEFAULT_DEVTOOLS_ORIGINS = [
  'https://loutrejs.come25136.id',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
] as const

export interface DevtoolsGraphSnapshot {
  readonly schemaVersion: typeof DEVTOOLS_PROTOCOL_VERSION
  readonly nodes: readonly unknown[]
  readonly edges: readonly unknown[]
  readonly diagnostics: readonly unknown[]
}

export interface StartDevtoolsServerOptions {
  readonly projectRoot: string
  readonly entry: string
  readonly port?: number
  readonly origins?: readonly string[]
  readonly loadGraph: () => Promise<DevtoolsGraphSnapshot>
}

export interface DevtoolsServer {
  readonly hostname: '127.0.0.1'
  readonly port: number
  readonly url: string
  close(): Promise<void>
}

interface GraphState {
  readonly revision: number
  readonly snapshot?: DevtoolsGraphSnapshot
  readonly error?: string
}

const ignoredPathSegments = new Set([
  '.git',
  '.next',
  'coverage',
  'dist',
  'node_modules',
])

export async function startDevtoolsServer(
  options: StartDevtoolsServerOptions,
): Promise<DevtoolsServer> {
  const origins = new Set(options.origins ?? DEFAULT_DEVTOOLS_ORIGINS)
  let state: GraphState = { revision: 0 }
  let reloadRequested = false
  let reloadPromise: Promise<void> | undefined
  let reloadTimer: ReturnType<typeof setTimeout> | undefined
  const clients = new Set<ServerResponse>()

  const broadcast = () => {
    const event = serializeStateEvent(state)
    for (const client of clients) client.write(event)
  }

  const reload = (): Promise<void> => {
    reloadRequested = true
    reloadPromise ??= (async () => {
      while (reloadRequested) {
        reloadRequested = false
        try {
          state = {
            revision: state.revision + 1,
            snapshot: await options.loadGraph(),
          }
        } catch (error) {
          state = {
            revision: state.revision + 1,
            ...(state.snapshot === undefined
              ? {}
              : { snapshot: state.snapshot }),
            error: error instanceof Error ? error.message : String(error),
          }
        }
        broadcast()
      }
    })().finally(() => {
      reloadPromise = undefined
    })
    return reloadPromise
  }

  await reload()

  const server = createServer((request, response) => {
    void handleRequest(request, response, {
      origins,
      projectRoot: options.projectRoot,
      entry: options.entry,
      state: () => state,
      clients,
      reload,
    })
  })

  let watcher: FSWatcher | undefined
  try {
    watcher = watch(
      options.projectRoot,
      { recursive: true },
      (_eventType, filename) => {
        if (filename && isIgnoredPath(filename)) return
        if (reloadTimer) clearTimeout(reloadTimer)
        reloadTimer = setTimeout(() => void reload(), 150)
      },
    )
    watcher.on('error', (error) => {
      state = {
        ...state,
        revision: state.revision + 1,
        error: `File watch failed: ${error.message}`,
      }
      broadcast()
    })

    await listen(server, options.port ?? DEFAULT_DEVTOOLS_PORT)
  } catch (error) {
    watcher?.close()
    throw error
  }

  const address = server.address()
  if (!address || typeof address === 'string') {
    watcher.close()
    await closeHttpServer(server)
    throw new Error('Loutre Devtools APIのlisten先を取得できませんでした。')
  }

  const heartbeat = setInterval(() => {
    for (const client of clients) client.write(': heartbeat\n\n')
  }, 15_000)
  heartbeat.unref()

  let closePromise: Promise<void> | undefined
  return {
    hostname: '127.0.0.1',
    port: address.port,
    url: `http://127.0.0.1:${address.port}`,
    close() {
      closePromise ??= (async () => {
        if (reloadTimer) clearTimeout(reloadTimer)
        clearInterval(heartbeat)
        watcher.close()
        for (const client of clients) client.end()
        clients.clear()
        await closeHttpServer(server)
      })()
      return closePromise
    },
  }
}

interface RequestContext {
  readonly origins: ReadonlySet<string>
  readonly projectRoot: string
  readonly entry: string
  readonly state: () => GraphState
  readonly clients: Set<ServerResponse>
  readonly reload: () => Promise<void>
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: RequestContext,
): Promise<void> {
  const origin = request.headers.origin
  if (origin !== undefined && !context.origins.has(origin)) {
    writeJson(response, 403, { error: 'Origin is not allowed.' })
    return
  }
  applyCorsHeaders(request, response, origin)

  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
  if (request.method === 'GET' && pathname === '/') {
    writeJson(response, 200, {
      name: 'Loutre Devtools API',
      protocolVersion: DEVTOOLS_PROTOCOL_VERSION,
      project: basename(context.projectRoot),
      entry: context.entry,
      endpoints: {
        graph: '/api/graph',
        events: '/api/events',
        reload: '/api/reload',
      },
    })
    return
  }

  if (request.method === 'GET' && pathname === '/api/graph') {
    writeGraphState(response, context.state())
    return
  }

  if (request.method === 'GET' && pathname === '/api/events') {
    response.writeHead(200, {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    })
    response.write(serializeStateEvent(context.state()))
    context.clients.add(response)
    request.once('close', () => context.clients.delete(response))
    return
  }

  if (request.method === 'POST' && pathname === '/api/reload') {
    await context.reload()
    writeGraphState(response, context.state())
    return
  }

  writeJson(response, 404, { error: 'Not found.' })
}

function writeGraphState(response: ServerResponse, state: GraphState): void {
  response.setHeader('X-Loutre-Revision', String(state.revision))
  if (state.error !== undefined) {
    writeJson(response, 503, {
      error: state.error,
      ...(state.snapshot === undefined ? {} : { snapshot: state.snapshot }),
    })
    return
  }
  if (state.snapshot === undefined) {
    writeJson(response, 503, { error: 'Graph is not ready.' })
    return
  }
  writeJson(response, 200, state.snapshot)
}

function serializeStateEvent(state: GraphState): string {
  const payload =
    state.error === undefined
      ? state.snapshot
      : {
          error: state.error,
          ...(state.snapshot === undefined ? {} : { snapshot: state.snapshot }),
        }
  const event = state.error === undefined ? 'graph' : 'graph-error'
  return `event: ${event}\nid: ${state.revision}\ndata: ${JSON.stringify(payload)}\n\n`
}

function applyCorsHeaders(
  request: IncomingMessage,
  response: ServerResponse,
  origin: string | undefined,
): void {
  if (origin !== undefined) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  response.setHeader('Access-Control-Expose-Headers', 'X-Loutre-Revision')
  if (request.headers['access-control-request-private-network'] === 'true') {
    response.setHeader('Access-Control-Allow-Private-Network', 'true')
  }
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(`${JSON.stringify(body)}\n`)
}

function isIgnoredPath(path: string): boolean {
  return normalize(path)
    .split(/[\\/]/)
    .some((segment) => ignoredPathSegments.has(segment))
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    server.once('error', onError)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', onError)
      resolve()
    })
  })
}

function closeHttpServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve()
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}
