import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import { Readable } from 'node:stream'
import {
  binding,
  type ApplicationDefinition,
  type BootstrapArguments,
  type HasHttp,
  type HostBindingApplication,
  type InvocationBindingOptions,
} from '@loutrejs/loutre'
import { type HttpProtocolExecution } from '@loutrejs/loutre/http'
import {
  LOUTRE_VERSION,
  detectPresentationTerminal,
  startStartupPresentation,
} from '@loutrejs/loutre/presentation'
import { nodeRuntimeCapabilities, serverUrl } from '@loutrejs/loutre/runtime'

type IsAny<TValue> = 0 extends 1 & TValue ? true : false

type HttpApplication<TDefinition extends ApplicationDefinition> =
  IsAny<TDefinition> extends true
    ? TDefinition
    : HasHttp<TDefinition> extends true
      ? TDefinition
      : never

export type NodeServeOptions<TDefinition extends ApplicationDefinition> = {
  readonly application: HttpApplication<TDefinition>
  readonly port?: number
  readonly hostname?: string
  readonly environment?: unknown
} & BootstrapArguments<TDefinition>

export interface NodeServeHandle<
  TDefinition extends ApplicationDefinition = ApplicationDefinition,
> {
  readonly application: HostBindingApplication<TDefinition>
  readonly server: Server
  readonly port: number
  close(signal?: string): Promise<void>
}

export const nodeRuntime = {
  ...nodeRuntimeCapabilities,
  serve,
} as const

async function serve<const TDefinition extends ApplicationDefinition>(
  options: NodeServeOptions<TDefinition>,
): Promise<NodeServeHandle<TDefinition>> {
  const startedAt = performance.now()
  const presentation = startStartupPresentation(
    { version: LOUTRE_VERSION },
    {
      terminal: detectPresentationTerminal(process.stdout, process.env),
      write: (value) => console.log(value),
    },
  )
  const host = binding.host({
    application: options.application,
    environment: 'environment' in options ? options.environment : process.env,
    ...('arguments' in options ? { arguments: options.arguments } : {}),
  } as unknown as InvocationBindingOptions<TDefinition>)
  const http = 'http' in host ? (host.http as HttpProtocolExecution) : undefined
  if (!http) {
    await host.application.close()
    throw new Error(
      'LUTRE_RUNTIME_HTTP_REQUIRED: nodeRuntime.serve() requires an HTTP-capable Application.',
    )
  }

  await host.application.init()
  if ('triggers' in host.application) await host.application.triggers.start()

  const server = createNodeHttpServerDriver(http)
  const requestedPort = options.port
  let port = requestedPort ?? 3000
  while (true) {
    try {
      await listenServer(server, port, options.hostname)
      break
    } catch (error) {
      if (requestedPort !== undefined || !canRetryOnNextPort(error, port)) {
        server.close()
        await host.application.close().catch(() => undefined)
        throw error
      }
      port += 1
    }
  }

  presentation.ready({
    server: serverUrl(options.hostname, port),
    runtime: `Node.js ${process.versions.node}`,
    environment: process.env.NODE_ENV ?? 'development',
    startupDurationMs: performance.now() - startedAt,
  })

  let closed = false
  let removeShutdownHooks: (() => void) | undefined
  const handle: NodeServeHandle<TDefinition> = {
    application: host.application,
    server,
    port,
    async close(signal?: string) {
      if (closed) return
      closed = true
      removeShutdownHooks?.()
      const errors: unknown[] = []
      try {
        await closeServer(server)
      } catch (error) {
        errors.push(error)
      }
      try {
        await host.application.close(signal)
      } catch (error) {
        errors.push(error)
      }
      if (errors.length > 0)
        throw new AggregateError(errors, 'Node runtime shutdown failed')
    },
  }
  removeShutdownHooks = registerNodeShutdownHooks((signal) =>
    handle.close(signal),
  )
  return handle
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

interface NodeHttpServerDriverOptions {
  readonly onListening?: (url: string) => void
}

function createNodeHttpServerDriver(
  application: HttpProtocolExecution,
  options: NodeHttpServerDriverOptions = {},
): Server {
  const initialization = application.initialize()
  void initialization.catch(() => undefined)

  const server = createServer(async (incoming, outgoing) => {
    const abortController = new AbortController()
    const abort = () => {
      if (!abortController.signal.aborted) {
        abortController.abort(
          new Error('HTTP client connectionが切断されました'),
        )
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
      const response = await application.handle(request)
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
    application.onServerListening(url)
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

function canRetryOnNextPort(error: unknown, port: number): boolean {
  return port < 65_535 && isAddressInUseError(error)
}

function isAddressInUseError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'EADDRINUSE'
  )
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error?: Error) => (error ? reject(error) : resolve()))
  })
}
