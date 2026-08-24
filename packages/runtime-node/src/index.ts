import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import { Readable } from 'node:stream'
import type { HttpApplication } from '@loutrefw/http'

export const nodeRuntime = {
  runtime: 'node-26',
  capabilities: new Set([
    'http.server',
    'http.request.streaming',
    'http.response.streaming',
    'stream.readable',
    'stream.writable',
    'messagePort.send',
    'messagePort.receive',
    'messagePort.transfer',
    'runtime.longLived',
    'runtime.shutdownHook',
    'env.runtime',
    'crypto.random',
  ]),
} as const

export interface NodeHttpServerOptions {
  readonly onListening?: (url: string) => void
}

export function createNodeHttpServer(
  application: HttpApplication,
  options: NodeHttpServerOptions = {},
): Server {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const origin = `http://${incoming.headers.host ?? 'localhost'}`
      const headers = new Headers()
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) headers.append(name, item)
        } else if (value !== undefined) {
          headers.set(name, value)
        }
      }
      const hasBody = incoming.method !== 'GET' && incoming.method !== 'HEAD'
      const init: RequestInit & { duplex?: 'half' } = {
        method: incoming.method ?? 'GET',
        headers,
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
      response.headers.forEach((value, name) => {
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
    const host = address.family === 'IPv6' ? `[${address.address}]` : address.address
    const url = `http://${host}:${address.port}`
    options.onListening?.(url)
    application.onServerListening(url)
  })
  return server
}
