import { nodeRuntime } from '@loutrejs/node'
import { defineApplication, defineModule } from '@loutrejs/loutre'
import { graphql } from '@loutrejs/graphql'
import { manifest } from '../examples/graphql-orders/src/generated/manifest.js'
import { CommerceService } from '../examples/graphql-orders/src/domain/commerce.js'
import { print } from 'graphql'
import { OrdersWithDetailsDocument } from '../examples/graphql-orders/src/client/generated.js'
import { createClient } from 'graphql-ws'
import WebSocket from 'ws'

it('生成Manifestの100注文 / 200明細がEager・Lazy・Hybridで一致し、HTTPとWSのOperation間を分離する', async () => {
  const commerce = new CommerceService()
  const calls = vi.spyOn(commerce, 'findProducts')
  const endpoint = graphql.endpoint({
    name: 'Orders',
    path: '/graphql',
    manifest,
    transports: { http: true, websocket: true },
    factory: () => ({ context: ({ signal }) => ({ commerce, signal }) }),
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
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/graphql`
  const query = print(OrdersWithDetailsDocument)
  const client = createClient({
    url: url.replace('http:', 'ws:'),
    webSocketImpl: WebSocket,
    retryAttempts: 0,
  })
  const request = (strategy: string) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables: { strategy } }),
    }).then((response) => response.json())
  const ws = () =>
    new Promise<unknown>((resolve, reject) => {
      let value: unknown
      client.subscribe(
        { query, variables: { strategy: 'LAZY' } },
        {
          next: (result) => {
            value = result
          },
          error: reject,
          complete: () => resolve(value),
        },
      )
    })
  try {
    const eager = await request('EAGER')
    expect(eager.errors).toBeUndefined()
    expect(eager.data.orders.totalCount).toBe(150)
    expect(eager.data.orders.edges).toHaveLength(100)
    expect(
      eager.data.orders.edges.flatMap((order: any) => order.items),
    ).toHaveLength(200)
    expect(calls).not.toHaveBeenCalled()
    const lazy = await request('LAZY')
    expect(lazy).toEqual(eager)
    expect(calls).toHaveBeenCalledOnce()
    expect(calls.mock.calls[0]![0]).toHaveLength(200)
    expect(await request('HYBRID')).toEqual(eager)
    expect(calls).toHaveBeenCalledTimes(2)
    calls.mockClear()
    expect(await Promise.all([request('LAZY'), request('LAZY')])).toEqual([
      eager,
      eager,
    ])
    expect(calls.mock.calls.map(([parents]) => parents.length)).toEqual([
      200, 200,
    ])
    calls.mockClear()
    expect(await Promise.all([ws(), ws()])).toEqual([eager, eager])
    expect(calls.mock.calls.map(([parents]) => parents.length)).toEqual([
      200, 200,
    ])
  } finally {
    await client.dispose()
    await app.close()
  }
})
