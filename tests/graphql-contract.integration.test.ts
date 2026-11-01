import { once } from 'node:events'
import { buildSchema } from 'graphql'
import WebSocket from 'ws'
import { nodeRuntime } from '@loutrejs/node'
import { graphql, ConnectionRejected } from '@loutrejs/graphql'
import {
  defineApplication,
  defineModule,
  inject,
  projectApplicationModel,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { generateOpenApi } from '@loutrejs/loutre/http/openapi'
import { manifestFromSchema } from './helpers/graphql-manifest.js'

it('同じHTTP Contractから通常HTTPとGraphQL HTTPとWSを配備し、継承したURLと認証の境界を保つ', async () => {
  class Greeting {
    readonly text = 'こんにちは'
  }
  const authenticated = vi.fn()
  const auth = http.middleware<{ user: string }>({
    name: 'HTTP認証',
    factory:
      () =>
      async ({ request }, next) => {
        authenticated()
        if (request.headers.get('authorization') !== 'Bearer valid')
          return new Response(null, { status: 401 })
        return next({ user: '利用者' })
      },
  })
  const Api = http.contract({
    api: {
      path: '/api',
      routes: {
        health: {
          method: 'GET',
          path: '/health',
          responses: { ok: { status: 204 } },
        },
        private: {
          middlewares: [auth],
          routes: { profile: { raw: true, method: '*', path: '/graphql' } },
        },
      },
    },
  })
  const schema = buildSchema('type Query { greeting: String! }')
  schema.getQueryType()!.getFields().greeting!.resolve = (
    _parent,
    _args,
    context: { greeting: string; user: string },
  ) => context.greeting + context.user
  const regular = http.implementation({
    name: 'Health',
    contract: Api,
    factory: () => ({ health: (ctx) => ctx.response.ok({}) }),
  })
  const delegated = graphql.implementation({
    name: 'Profile',
    route: Api.routes.profile,
    manifest: manifestFromSchema(schema),
    ws: true,
    factory: (greeting = inject(Greeting)) => ({
      ws: {
        connectionInit: ({ payload }) =>
          payload?.token === 'valid'
            ? { user: '利用者' }
            : new ConnectionRejected('認証が必要です。'),
      },
      context: ({ state }) => ({ greeting: greeting.text, user: state.user }),
    }),
  })
  const Module = defineModule(() => ({
    providers: [Greeting],
    executions: [regular, delegated],
  }))
  const application = defineApplication({ modules: [Module()] })
  expect(application.model.diagnostics).toEqual([])
  for (const source of [Api, application.model])
    expect(
      Object.keys(
        generateOpenApi(source, { info: { title: '試験', version: '1' } })
          .paths,
      ),
    ).toEqual(['/api/health'])
  const graph = projectApplicationModel(application.model)
  expect(
    graph.executions.filter(
      (node) => node.executionKind === 'websocket.session',
    ),
  ).toHaveLength(1)
  const app = await nodeRuntime.create({ application })
  const { server } = await app.serve({
    port: 0,
    hostname: '127.0.0.1',
    shutdownHooks: false,
  })
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const socket = new WebSocket(
    origin.replace('http:', 'ws:') + '/api/graphql',
    ['graphql-transport-ws'],
  )
  try {
    expect((await fetch(origin + '/api/health')).status).toBe(204)
    expect((await fetch(origin + '/graphql?query=%7Bgreeting%7D')).status).toBe(
      404,
    )
    expect(
      (await fetch(origin + '/api/graphql?query=%7Bgreeting%7D')).status,
    ).toBe(401)
    const response = await fetch(origin + '/api/graphql?query=%7Bgreeting%7D', {
      headers: { authorization: 'Bearer valid' },
    })
    expect(await response.json()).toEqual({
      data: { greeting: 'こんにちは利用者' },
    })
    expect(authenticated).toHaveBeenCalledTimes(2)
    if (socket.readyState !== WebSocket.OPEN) await once(socket, 'open')
    let received = once(socket, 'message')
    socket.send(
      JSON.stringify({ type: 'connection_init', payload: { token: 'valid' } }),
    )
    expect(JSON.parse(String((await received)[0]))).toEqual({
      type: 'connection_ack',
    })
    received = once(socket, 'message')
    socket.send(
      JSON.stringify({
        type: 'subscribe',
        id: '1',
        payload: { query: '{greeting}' },
      }),
    )
    expect(JSON.parse(String((await received)[0]))).toEqual({
      type: 'next',
      id: '1',
      payload: { data: { greeting: 'こんにちは利用者' } },
    })
    expect(authenticated).toHaveBeenCalledTimes(2)
    const wrong = new WebSocket(origin.replace('http:', 'ws:') + '/graphql', [
      'graphql-transport-ws',
    ])
    await new Promise<void>((resolve, reject) => {
      wrong.on('unexpected-response', (_request, failed) => {
        try {
          expect(failed.statusCode).toBe(404)
          failed.resume()
          wrong.terminate()
          resolve()
        } catch (error) {
          reject(error)
        }
      })
      wrong.on('error', () => {})
      wrong.on('open', () => {
        wrong.terminate()
        reject(new Error('未定義のURLへ接続できました。'))
      })
    })
  } finally {
    socket.terminate()
    await app.close()
  }
})
