import { createClient, type FormattedExecutionResult } from 'graphql-ws'
import WebSocket from 'ws'
import {
  runWorkspaceCommand,
  startWorkspace,
  waitForPort,
} from './helpers/example-process.js'
import { reserveHttpPort } from './helpers/http-server.js'

const workspace = '@loutrejs/example-graphql-counter'

it('GraphQL exampleでHTTP mutationを別clientの購読へ配信し、停止・切断時に購読を回収する', async () => {
  const checked = runWorkspaceCommand(workspace, 'check')
  expect(checked.status, checked.stderr || checked.stdout).toBe(0)
  const port = await reserveHttpPort()
  const example = startWorkspace(workspace, 'start', { PORT: String(port) })
  const clients = [0, 1].map(() =>
    createClient({
      url: `ws://127.0.0.1:${port}/graphql`,
      webSocketImpl: WebSocket,
      retryAttempts: 0,
    }),
  )
  const events: FormattedExecutionResult<Record<string, unknown>, unknown>[][] =
    [[], []]
  const errors: unknown[] = []

  async function request(query: string, variables = {}) {
    const response = await fetch(`http://127.0.0.1:${port}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    expect(response.status).toBe(200)
    return response.json()
  }

  try {
    await waitForPort(port)
    const stops = clients.map((client, index) =>
      client.subscribe(
        {
          query: 'subscription { counterChanged { value } }',
        },
        {
          next: (result) => events[index]!.push(result),
          error: (error) => errors.push(error),
          complete: () => {},
        },
      ),
    )
    await vi.waitFor(
      () => {
        expect(events).toEqual([
          [{ data: { counterChanged: { value: 0 } } }],
          [{ data: { counterChanged: { value: 0 } } }],
        ])
      },
      { timeout: 5000 },
    )
    expect(await request('query { activeSubscriptions }')).toEqual({
      data: { activeSubscriptions: 2 },
    })

    expect(
      await request(
        'mutation Add($amount: Int!) { increment(amount: $amount) { value } }',
        { amount: 5 },
      ),
    ).toEqual({ data: { increment: { value: 5 } } })
    await vi.waitFor(
      () => {
        for (const received of events) {
          expect(received).toHaveLength(2)
          expect(received[1]).toEqual({
            data: { counterChanged: { value: 5 } },
          })
        }
      },
      { timeout: 5000 },
    )

    stops[0]!()
    await vi.waitFor(
      async () => {
        expect(await request('query { activeSubscriptions }')).toEqual({
          data: { activeSubscriptions: 1 },
        })
      },
      { timeout: 5000 },
    )
    expect(await request('mutation { reset { value } }')).toEqual({
      data: { reset: { value: 0 } },
    })
    await vi.waitFor(
      () => {
        expect(events[1]).toHaveLength(3)
        expect(events[1]![2]).toEqual({
          data: { counterChanged: { value: 0 } },
        })
      },
      { timeout: 5000 },
    )
    expect(events[0]).toHaveLength(2)

    await clients[1]!.dispose()
    await vi.waitFor(
      async () => {
        expect(
          await request('query { counter { value } activeSubscriptions }'),
        ).toEqual({
          data: { counter: { value: 0 }, activeSubscriptions: 0 },
        })
      },
      { timeout: 5000 },
    )
    expect(errors).toEqual([])
  } finally {
    await Promise.all(clients.map((client) => client.dispose()))
    await example.stop()
  }
})
