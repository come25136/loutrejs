import { createClient, type FormattedExecutionResult } from 'graphql-ws'
import WebSocket from 'ws'
import { nodeRuntime } from '@loutrejs/node'
import application from '../examples/graphql-auth/src/app.js'
import { Users } from '../examples/graphql-auth/src/auth/users.js'
import { Connections } from '../examples/graphql-auth/src/auth/connections.js'

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
  function client(connectionParams: Record<string, unknown>, headers = {}) {
    class OpeningSocket extends WebSocket {
      constructor(address: string, protocols: string[]) {
        super(address, protocols, { headers })
      }
    }
    const result = createClient({
      url: `${url.replace('http:', 'ws:')}/graphql`,
      connectionParams,
      webSocketImpl: OpeningSocket,
      retryAttempts: 0,
    })
    clients.push(result)
    return result
  }
  return {
    app,
    url,
    request,
    client,
    async close() {
      await Promise.all(clients.map((connection) => connection.dispose()))
      await app.close()
    },
  }
}

it.each([
  { authorization: 'Bearer momiji-token' },
  { 'x-api-key': 'momiji-key' },
])('通常HTTPとGraphQL HTTPが同じ資格情報%sで認証する', async (headers) => {
  const server = await start()
  const authenticate = vi.spyOn(server.app.get(Users), 'authenticate')
  try {
    const response = await fetch(`${server.url}/me`, { headers })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 'user-1', name: 'もみじ' })
    const graphql = await server.request(headers)
    expect(graphql.status).toBe(200)
    expect(await graphql.json()).toEqual({
      data: { viewer: { id: 'user-1', name: 'もみじ' } },
    })
    expect(authenticate).toHaveBeenCalledTimes(2)
  } finally {
    await server.close()
  }
})

it.each([{}, { authorization: 'Bearer invalid' }, { 'x-api-key': 'invalid' }])(
  '通常HTTPとGraphQL HTTPが未認証の%sを401で拒否する',
  async (headers) => {
    const server = await start()
    try {
      for (const response of [
        await fetch(`${server.url}/me`, { headers }),
        await server.request(headers),
      ]) {
        expect(response.status).toBe(401)
        expect(await response.json()).toEqual({ error: '認証が必要です。' })
      }
    } finally {
      await server.close()
    }
  },
)

it('WSは接続時だけ認証し、同時接続の利用者と通知を分離し、切断時に記録を削除する', async () => {
  const server = await start()
  const authenticate = vi.spyOn(server.app.get(Users), 'authenticate')
  const disconnect = vi.spyOn(server.app.get(Connections), 'disconnect')
  const errors: unknown[] = []
  const events: FormattedExecutionResult<Record<string, unknown>, unknown>[][] =
    [[], []]
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
        next: (data) => events[index]!.push(data),
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
    const query = clients[0]!.iterate({ query: '{ viewer { id name } }' })
    expect((await query.next()).value).toEqual({
      data: { viewer: { id: 'user-1', name: 'もみじ' } },
    })
    await query.return?.()
    expect(authenticate).toHaveBeenCalledTimes(2)
    const response = await server.request(
      { authorization: 'Bearer momiji-token' },
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
    expect(errors).toEqual([])
    await Promise.all(clients.map((connection) => connection.dispose()))
    await vi.waitFor(() => expect(disconnect).toHaveBeenCalledTimes(2))
    for (const [request] of disconnect.mock.calls) {
      expect(() => server.app.get(Connections).requireUser(request)).toThrow(
        '認証済みの接続がありません。',
      )
    }
  } finally {
    await server.close()
  }
})

it.each([
  [{}, {}],
  [{ authorization: 123 }, {}],
  [{ apiKey: 'invalid' }, {}],
  [
    { authorization: 'Bearer momiji-token' },
    { authorization: 'Bearer invalid' },
  ],
])(
  'WSは不正な資格情報やヘッダーをpayloadで迂回する接続を4403で拒否する: %s',
  async (params, headers) => {
    const server = await start()
    const disconnect = vi.spyOn(server.app.get(Connections), 'disconnect')
    try {
      const stream = server
        .client(params, headers)
        .iterate({ query: '{ viewer { id } }' })
      await expect(stream.next()).rejects.toMatchObject({ code: 4403 })
      await vi.waitFor(() => expect(disconnect).toHaveBeenCalledOnce())
    } finally {
      await server.close()
    }
  },
)

it('WSのopening requestでもAPI keyを認証し、drainで接続記録を削除する', async () => {
  const server = await start()
  const connections = server.app.get(Connections)
  const disconnect = vi.spyOn(connections, 'disconnect')
  const stream = server
    .client({}, { 'x-api-key': 'momiji-key' })
    .iterate({ query: 'subscription { viewerChanged { id } }' })
  try {
    expect((await stream.next()).value).toEqual({
      data: { viewerChanged: { id: 'user-1' } },
    })
    await server.app.close()
    expect(disconnect).toHaveBeenCalledOnce()
    const request = disconnect.mock.calls[0]![0]
    expect(() => connections.requireUser(request)).toThrow(
      '認証済みの接続がありません。',
    )
  } finally {
    await stream.return?.()
    await server.close()
  }
})
