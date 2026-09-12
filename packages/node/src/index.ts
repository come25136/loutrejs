import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import { Readable } from 'node:stream'
import {
  createKernelApplication,
  type ApplicationDefinition,
  type BootstrapArguments,
  type KernelHostedApplication,
  type RequireApplicationHost,
  type RuntimeCapabilityBinding,
} from '@loutrejs/loutre'
import {
  bindHttpServer,
  httpExecutionExtension,
  type HttpHostApi,
} from '@loutrejs/loutre/http'
import {
  LOUTRE_VERSION,
  detectPresentationTerminal,
  startStartupPresentation,
} from '@loutrejs/loutre/presentation'
import {
  assertRuntimeEngine,
  canRetryOnNextPort,
  initialServerPort,
  nodeRuntimeSupport,
  serverUrl,
} from '@loutrejs/loutre/runtime'

type HttpApplication<TDefinition extends ApplicationDefinition> =
  RequireApplicationHost<TDefinition, 'http'>

export type NodeCreateOptions<TDefinition extends ApplicationDefinition> = {
  readonly application: HttpApplication<TDefinition>
  readonly environment?: unknown
  readonly capabilities?: readonly RuntimeCapabilityBinding[]
  readonly forceShutdownTimeoutMs?: number
} & BootstrapArguments<TDefinition>

export interface NodeServeOptions {
  readonly port?: number
  readonly hostname?: string
  readonly shutdownHooks?: boolean
}

export interface NodeListenerHandle {
  readonly server: Server
  readonly port: number
}

export type NodeRuntimeApplication<
  TDefinition extends ApplicationDefinition = ApplicationDefinition,
> = KernelHostedApplication<TDefinition> & {
  serve(options?: NodeServeOptions): Promise<NodeListenerHandle>
}

export const nodeRuntime = {
  ...nodeRuntimeSupport,
  create,
} as const

async function create<const TDefinition extends ApplicationDefinition>(
  options: NodeCreateOptions<TDefinition>,
): Promise<NodeRuntimeApplication<TDefinition>> {
  assertRuntimeEngine('node')
  const startedAt = performance.now()
  const presentation = startStartupPresentation(
    { version: LOUTRE_VERSION },
    {
      terminal: detectPresentationTerminal(process.stdout, process.env),
      write: (value) => console.log(value),
    },
  )

  if (
    options.application.model.extensions.get(httpExecutionExtension) ===
    undefined
  ) {
    throw new Error(
      'LUTRE_RUNTIME_HTTP_REQUIRED: nodeRuntime.create() requires the HTTP Execution Extension.',
    )
  }

  const hosted = createKernelApplication<TDefinition>({
    ...options,
    application: options.application,
    capabilities: [
      bindHttpServer({ runtime: 'node' }),
      ...(options.capabilities ?? []),
    ],
    environment: 'environment' in options ? options.environment : process.env,
  })
  await hosted.init()
  const application = hosted as NodeRuntimeApplication<TDefinition>
  const http = (hosted as unknown as { readonly http: HttpHostApi }).http

  const closeApplication = application.close.bind(application)
  let server: Server | undefined
  let removeShutdownHooks: (() => void) | undefined
  let serving = false
  let closed = false
  let closingPromise: Promise<void> | undefined
  let serverClosingPromise: Promise<void> | undefined

  const beginServerClose = (): Promise<void> => {
    if (serverClosingPromise) return serverClosingPromise
    if (!server?.listening) return Promise.resolve()
    const closingServer = server
    serverClosingPromise = closeServer(closingServer).then(
      () => {
        if (server === closingServer) server = undefined
      },
      (error: unknown) => {
        serverClosingPromise = undefined
        throw error
      },
    )
    void serverClosingPromise.catch(() => undefined)
    return serverClosingPromise
  }

  const close = (signal?: string): Promise<void> => {
    if (closed) return Promise.resolve()
    if (closingPromise) return closingPromise

    closingPromise = (async () => {
      removeShutdownHooks?.()
      removeShutdownHooks = undefined
      const errors: unknown[] = []
      const serverClosing = beginServerClose()
      try {
        await closeApplication(signal)
      } catch (error) {
        errors.push(error)
      }
      if (errors.length === 0) {
        try {
          await serverClosing
        } catch (error) {
          errors.push(error)
        }
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, 'Node runtime shutdown failed')
      }
      closed = true
    })().catch((error: unknown) => {
      closingPromise = undefined
      throw error
    })

    return closingPromise
  }

  const serve = async (
    serveOptions: NodeServeOptions = {},
  ): Promise<NodeListenerHandle> => {
    if (closed) {
      throw new Error('LUTRE_APP_STOPPED: Application is stopped.')
    }
    if (serving) {
      throw new Error(
        'LUTRE_RUNTIME_ALREADY_SERVING: Node runtime Application is already serving.',
      )
    }
    serving = true
    try {
      server = createNodeHttpServerDriver(http)
      const requestedPort = serveOptions.port
      let port = initialServerPort(requestedPort)
      while (true) {
        try {
          await listenServer(server, port, serveOptions.hostname)
          break
        } catch (error) {
          if (requestedPort !== undefined || !canRetryOnNextPort(error, port)) {
            throw error
          }
          port += 1
        }
      }

      presentation.ready({
        server: serverUrl(serveOptions.hostname, port),
        runtime: `Node.js ${process.versions.node}`,
        environment: process.env.NODE_ENV ?? 'development',
        startupDurationMs: performance.now() - startedAt,
      })

      removeShutdownHooks =
        serveOptions.shutdownHooks === false
          ? undefined
          : registerNodeShutdownHooks(close)
      return { server, port }
    } catch (error) {
      await close().catch(() => undefined)
      throw error
    }
  }

  Object.assign(application, { serve, close })
  return application
}

function registerNodeShutdownHooks(
  close: (signal: string) => Promise<void>,
): () => void {
  const handlers = new Map<NodeJS.Signals, () => void>()
  const remove = () => {
    for (const [signal, handler] of handlers) process.off(signal, handler)
    handlers.clear()
  }
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    const handler = () => {
      remove()
      void close(signal)
    }
    handlers.set(signal, handler)
    process.once(signal, handler)
  }
  return remove
}

interface NodeHttpRequestHandler {
  initialize?(): Promise<void>
  fetch(request: Request): Promise<Response>
  onServerListening?(url: string): void
}

interface NodeHttpServerDriverOptions {
  readonly onListening?: (url: string) => void
}

function createNodeHttpServerDriver(
  application: NodeHttpRequestHandler,
  options: NodeHttpServerDriverOptions = {},
): Server {
  const initialization = application.initialize?.() ?? Promise.resolve()
  void initialization.catch(() => undefined)

  const server = createServer(async (incoming, outgoing) => {
    const abortController = new AbortController()
    const abort = () => {
      if (!abortController.signal.aborted) {
        abortController.abort(new Error('HTTP client connection was closed'))
      }
    }
    incoming.once('aborted', abort)
    outgoing.once('close', () => {
      if (!outgoing.writableEnded) abort()
    })
    try {
      await initialization
      const origin = `http://${incoming.headers.host ?? 'localhost'}`
      const headers = new Headers()
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) headers.append(name, item)
        } else if (value !== undefined) {
          headers.set(name, String(value))
        }
      }
      const hasBody = incoming.method !== 'GET' && incoming.method !== 'HEAD'
      const init: RequestInit & { duplex?: 'half' } = {
        method: incoming.method ?? 'GET',
        headers,
        signal: abortController.signal,
        ...(hasBody
          ? {
              body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>,
              duplex: 'half' as const,
            }
          : {}),
      }
      const request = new Request(new URL(incoming.url ?? '/', origin), init)
      const response = await application.fetch(request)
      outgoing.statusCode = response.status
      response.headers.forEach((value: string, name: string) => {
        if (name !== 'set-cookie') outgoing.setHeader(name, value)
      })
      const cookies = response.headers.getSetCookie()
      if (cookies.length > 0) outgoing.setHeader('set-cookie', cookies)
      if (!response.body) {
        outgoing.end()
        return
      }
      const reader = response.body.getReader()
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        if (!outgoing.write(Buffer.from(chunk.value))) {
          await once(outgoing, 'drain')
        }
      }
      outgoing.end()
    } catch {
      if (outgoing.headersSent) {
        outgoing.destroy()
        return
      }
      outgoing.statusCode = 500
      outgoing.setHeader('content-type', 'application/json; charset=utf-8')
      outgoing.end(JSON.stringify({ error: 'Internal Server Error' }))
    }
  })
  server.on('listening', () => {
    const address = server.address()
    if (!address || typeof address === 'string') return
    const host =
      address.family === 'IPv6' ? `[${address.address}]` : address.address
    const url = `http://${host}:${address.port}`
    options.onListening?.(url)
    application.onServerListening?.(url)
  })
  return server
}

function listenServer(
  server: Server,
  port: number,
  hostname?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, hostname)
  })
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error?: Error) => (error ? reject(error) : resolve()))
  })
}
