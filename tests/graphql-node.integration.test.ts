import { manifestFromSchema } from './helpers/graphql-manifest.js'
import { request as httpRequest } from 'node:http'
import { once } from 'node:events'
import { describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { buildSchema } from 'graphql'
import { graphql, type GraphQLWebSocketHooks } from '@loutrejs/graphql'
import { defineApplication, defineModule } from '@loutrejs/loutre'
import { nodeRuntime } from '@loutrejs/node'
import { serverAudits } from 'graphql-http'

async function create(http: boolean, hooks: GraphQLWebSocketHooks = {}) {
  const schema = buildSchema(
    'type Query { hello: String! } type Subscription { hello: String! }',
  )
  schema.getQueryType()!.getFields().hello!.resolve = () => 'Hello World'
  const hello = schema.getSubscriptionType()!.getFields().hello!
  hello.subscribe = async function* () {
    yield 'Hello World'
  }
  hello.resolve = (event: string) => event
  const endpoint = graphql.endpoint({
    name: 'Native',
    path: '/graphql',
    manifest: manifestFromSchema(schema),
    transports: { http, websocket: true },
    factory: () => ({ context: () => ({}), websocket: hooks }),
  })
  const Module = defineModule(() => ({ executions: [endpoint] }))
  const app = await nodeRuntime.create({
    application: defineApplication({ modules: [Module()] }),
  })
  const { server } = await app.serve({
    port: 0,
    hostname: '127.0.0.1',
    shutdownHooks: false,
  })
  const address = server.address() as { port: number }
  return { app, url: `http://127.0.0.1:${address.port}/graphql` }
}

describe('Node native HTTP/WebSocket', () => {
  it.each(['payload', 'header', 'reject'] as const)(
    'native接続の%sをアプリ指定の接続フックで判断する',
    async (mode) => {
      const { app, url } = await create(true, {
        onConnect({ connectionParams, extra }) {
          return (
            connectionParams?.secret === 'valid' ||
            extra.request.headers.get('x-api-key') === 'valid'
          )
        },
      })
      const socket = new WebSocket(
        url.replace('http:', 'ws:'),
        ['graphql-transport-ws'],
        {
          headers: mode === 'header' ? { 'x-api-key': 'valid' } : {},
        },
      )
      try {
        await once(socket, 'open')
        if (mode === 'reject') {
          const closed = once(socket, 'close')
          socket.send(
            JSON.stringify({
              type: 'connection_init',
              payload: { secret: 'invalid' },
            }),
          )
          expect((await closed)[0]).toBe(4403)
        } else {
          let received = once(socket, 'message')
          socket.send(
            JSON.stringify({
              type: 'connection_init',
              ...(mode === 'payload' ? { payload: { secret: 'valid' } } : {}),
            }),
          )
          expect(JSON.parse(String((await received)[0]))).toEqual({
            type: 'connection_ack',
          })
          received = once(socket, 'message')
          socket.send(
            JSON.stringify({
              id: 'q',
              type: 'subscribe',
              payload: { query: '{hello}' },
            }),
          )
          expect(JSON.parse(String((await received)[0]))).toEqual({
            id: 'q',
            type: 'next',
            payload: { data: { hello: 'Hello World' } },
          })
        }
      } finally {
        socket.terminate()
        await app.close()
      }
    },
  )

  it.each([true, false])(
    'HTTP=%sで同一serverのupgradeに接続しprotocolとQueryを確認する',
    async (http) => {
      const { app, url } = await create(http)
      const socket = new WebSocket(url.replace('http:', 'ws:'), [
        'other',
        'graphql-transport-ws',
      ])
      try {
        await once(socket, 'open')
        expect(socket.protocol).toBe('graphql-transport-ws')
        let received = once(socket, 'message')
        socket.send(JSON.stringify({ type: 'connection_init' }))
        expect(JSON.parse(String((await received)[0])).type).toBe(
          'connection_ack',
        )
        received = once(socket, 'message')
        socket.send(
          JSON.stringify({
            id: '1',
            type: 'subscribe',
            payload: { query: '{hello}' },
          }),
        )
        expect(JSON.parse(String((await received)[0]))).toEqual({
          id: '1',
          type: 'next',
          payload: { data: { hello: 'Hello World' } },
        })
        const response = await fetch(`${url}?query=%7Bhello%7D`)
        expect(response.status).toBe(http ? 200 : 404)
        await response.text()
        const closing = once(socket, 'close')
        await app.close()
        expect((await closing)[0]).toBe(1001)
      } finally {
        socket.terminate()
        await app.close()
      }
    },
  )

  it('native handshakeの拒否でもExecutionLeaseを解放してshutdownできる', async () => {
    const { app, url } = await create(true)
    try {
      const status = await new Promise<number>((resolve, reject) => {
        const request = httpRequest(
          url,
          {
            headers: {
              Connection: 'Upgrade',
              Upgrade: 'websocket',
              'Sec-WebSocket-Version': '13',
              'Sec-WebSocket-Protocol': 'graphql-transport-ws',
            },
          },
          (response) => {
            response.resume()
            response.on('end', () => resolve(response.statusCode!))
          },
        )
        request.on('error', reject)
        request.end()
      })
      expect(status).toBe(400)
      await app.close()
    } finally {
      await app.close()
    }
  })

  it('graphql-httpのserver auditでHTTP protocol conformanceを検証する', async () => {
    const { app, url } = await create(true)
    try {
      for (const audit of serverAudits({ url })) {
        const result = await audit.fn()
        expect(
          result.status,
          `${audit.name}: ${'error' in result ? String(result.error) : ''}`,
        ).toBe('ok')
      }
    } finally {
      await app.close()
    }
  })
})
