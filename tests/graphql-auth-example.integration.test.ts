import { createClient, type FormattedExecutionResult } from 'graphql-ws'
import WebSocket from 'ws'
import { nodeRuntime } from '@loutrejs/node'
import application from '../examples/graphql-auth/src/app.js'
import { Users } from '../examples/graphql-auth/src/auth/users.js'

type Pattern = 'bearer' | 'api-key'
interface AuthCase {
  pattern: Pattern
  headers: Record<string, string>
  payload: Record<string, unknown>
  invalidHeaders: Record<string, string>
  invalidPayload: Record<string, unknown>
  openingHeaders: Record<string, string>
}
const cases: readonly AuthCase[] = [
  {
    pattern: 'bearer',
    headers: { authorization: 'Bearer momiji-token' },
    payload: { authorization: 'Bearer momiji-token' },
    invalidHeaders: { authorization: 'Bearer invalid' },
    invalidPayload: { authorization: 'Bearer invalid' },
    openingHeaders: { 'x-api-key': 'kaede-key' },
  },
  {
    pattern: 'api-key',
    headers: { 'x-api-key': 'momiji-key' },
    payload: { apiKey: 'momiji-key' },
    invalidHeaders: { 'x-api-key': 'invalid' },
    invalidPayload: { apiKey: 'invalid' },
    openingHeaders: { authorization: 'Bearer kaede-token' },
  },
]

async function start() {
  const app = await nodeRuntime.create({ application })
  const { server } = await app.serve({
    port: 0,
    hostname: '127.0.0.1',
    shutdownHooks: false,
  })
  const port = (server.address() as { port: number }).port
  const url = `http://127.0.0.1:${port}`
  const clients: ReturnType<typeof createClient>[] = []
  const request = (
    headers: Record<string, string>,
    query = '{ viewer { id name } }',
  ) =>
    fetch(`${url}/graphql`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
    })
  function client(
    payload: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) {
    class OpeningSocket extends WebSocket {
      constructor(address: string, protocols: string[]) {
        super(address, protocols, { headers })
      }
    }
    const result = createClient({
      url: `${url.replace('http:', 'ws:')}/graphql`,
      connectionParams: payload,
      webSocketImpl: OpeningSocket,
      retryAttempts: 0,
    })
    clients.push(result)
    return result
  }
  return {
    app,
    request,
    client,
    async close() {
      await Promise.all(clients.map((connection) => connection.dispose()))
      await app.close()
    },
  }
}

it.each(cases)(
  '同じURLのHTTPで$pattern を認証し、不正な資格情報は拒否する',
  async (auth) => {
    const server = await start()
    const authenticate = vi.spyOn(server.app.get(Users), 'authenticate')
    try {
      const response = await server.request(auth.headers)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        data: { viewer: { id: 'user-1', name: 'もみじ' } },
      })
      expect(authenticate).toHaveBeenCalledOnce()
      for (const headers of [{}, auth.invalidHeaders]) {
        const rejected = await server.request(headers)
        expect(rejected.status).toBe(401)
        expect(await rejected.json()).toEqual({
          error: 'Authentication required.',
        })
      }
    } finally {
      await server.close()
    }
  },
)

it.each(cases)(
  'WSの$pattern でConnectionInitだけを認証し、HTTPヘッダーへfallbackしない',
  async (auth) => {
    const server = await start()
    try {
      const stream = server
        .client(auth.payload, auth.openingHeaders)
        .iterate({ query: '{ viewer { id name } }' })
      expect((await stream.next()).value).toEqual({
        data: { viewer: { id: 'user-1', name: 'もみじ' } },
      })
      await stream.return?.()
      for (const payload of [
        {},
        auth.invalidPayload,
        { authorization: 123, apiKey: 123 },
      ]) {
        const rejected = server
          .client(payload, auth.headers)
          .iterate({ query: '{viewer{id}}' })
        await expect(rejected.next()).rejects.toMatchObject({
          code: 4403,
          reason: 'Authentication required.',
        })
      }
    } finally {
      await server.close()
    }
  },
)

it('同じURLでHTTP MutationからWS Subscriptionへ通知し、認証方式とユーザーを分離する', async () => {
  const server = await start()
  const authenticate = vi.spyOn(server.app.get(Users), 'authenticate')
  const events: FormattedExecutionResult<Record<string, unknown>, unknown>[][] =
    [[], []]
  const errors: unknown[] = []
  const acks: unknown[] = []
  const clients = [
    server.client({ authorization: 'Bearer momiji-token' }),
    server.client({ apiKey: 'kaede-key' }),
  ]
  clients.forEach((client, index) => {
    client.on('connected', (_socket, payload) => acks.push(payload))
    client.subscribe(
      { query: 'subscription { viewerChanged { id name } }' },
      {
        next: (value) => events[index]!.push(value),
        error: (error) => errors.push(error),
        complete() {},
      },
    )
  })
  try {
    await vi.waitFor(() =>
      expect(events).toEqual([
        [{ data: { viewerChanged: { id: 'user-1', name: 'もみじ' } } }],
        [{ data: { viewerChanged: { id: 'user-2', name: 'かえで' } } }],
      ]),
    )
    expect(acks).toEqual([undefined, undefined])
    expect(authenticate).toHaveBeenCalledTimes(2)
    const query = clients[0]!.iterate({ query: '{viewer{id name}}' })
    expect((await query.next()).value).toEqual({
      data: { viewer: { id: 'user-1', name: 'もみじ' } },
    })
    await query.return?.()
    expect(authenticate).toHaveBeenCalledTimes(2)
    const response = await server.request(
      { 'x-api-key': 'momiji-key' },
      'mutation { renameViewer(name: "変更後") { id name } }',
    )
    expect(await response.json()).toEqual({
      data: { renameViewer: { id: 'user-1', name: '変更後' } },
    })
    await vi.waitFor(() => expect(events[0]).toHaveLength(2))
    expect(events[0]![1]).toEqual({
      data: { viewerChanged: { id: 'user-1', name: '変更後' } },
    })
    expect(events[1]).toHaveLength(1)
    const updated = clients[0]!.iterate({ query: '{viewer{id name}}' })
    expect((await updated.next()).value).toEqual({
      data: { viewer: { id: 'user-1', name: '変更後' } },
    })
    await updated.return?.()
    expect(authenticate).toHaveBeenCalledTimes(3)
    expect(errors).toEqual([])
  } finally {
    await server.close()
  }
})

it.each(cases)('WSの$pattern でdrain時に購読と接続を終了する', async (auth) => {
  const server = await start()
  const stream = server
    .client(auth.payload)
    .iterate({ query: 'subscription { viewerChanged { id } }' })
  try {
    expect((await stream.next()).value).toEqual({
      data: { viewerChanged: { id: 'user-1' } },
    })
    await server.app.close()
    await expect(stream.next()).rejects.toMatchObject({ code: 1001 })
  } finally {
    await stream.return?.()
    await server.close()
  }
})
