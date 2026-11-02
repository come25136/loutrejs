import { once } from 'node:events'
import { buildSchema } from 'graphql'
import { request as httpRequest } from 'node:http'
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
  const auth = http.middleware<{ user?: string }>({
    name: 'HttpAuthentication',
    factory:
      () =>
      async ({ request }, next) => {
        authenticated()
        if (http.isWebSocketUpgrade(request)) return next({})
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
            : new ConnectionRejected('Authentication required.'),
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
    expect(authenticated).toHaveBeenCalledTimes(3)
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
        reject(new Error('Connected to an undefined URL.'))
      })
    })
  } finally {
    socket.terminate()
    await app.close()
  }
})

it('Upgradeでも継承したmiddlewareをDIして順番に実行し、HTTP拒否のstatus・headers・bodyを返す', async () => {
  class Gate {
    readonly events: string[] = []
  }
  const layer = http.middleware({
    name: 'AccessControl',
    factory:
      (gate = inject(Gate)) =>
      async ({ request }, next) => {
        gate.events.push('開始')
        if (request.headers.has('x-blocked'))
          return Response.json(
            { error: 'Connection denied.' },
            { status: 403, headers: { 'retry-after': '30' } },
          )
        await next()
        gate.events.push('終了')
      },
  })
  const Api = http.contract({
    api: {
      path: '/api',
      middlewares: [layer],
      routes: { graphql: { raw: true, method: '*', path: '/graphql' } },
    },
  })
  const schema = buildSchema('type Query { hello: String }')
  schema.getQueryType()!.getFields().hello!.resolve = () => 'hello'
  const execution = graphql.implementation({
    name: 'Middleware',
    route: Api.routes.graphql,
    manifest: manifestFromSchema(schema),
    http: false,
    ws: true,
    factory: () => ({ context: () => ({}) }),
  })
  const Module = defineModule(() => ({
    providers: [Gate],
    executions: [execution],
  }))
  const application = defineApplication({ modules: [Module()] })
  const graph = projectApplicationModel(application.model)
  const ws = graph.executions.find(
    (node) => node.executionKind === 'websocket.session',
  )!
  const provider = graph.providers.find((node) => node.name === 'Gate')!
  expect(
    graph.edges.some((edge) => edge.from === ws.id && edge.to === provider.id),
  ).toBe(true)
  const app = await nodeRuntime.create({ application })
  const gate = app.get(Gate)
  const { server } = await app.serve({
    port: 0,
    hostname: '127.0.0.1',
    shutdownHooks: false,
  })
  const url = `ws://127.0.0.1:${(server.address() as { port: number }).port}/api/graphql`
  try {
    const denied = new WebSocket(url, ['graphql-transport-ws'], {
      headers: { 'x-blocked': 'true' },
    })
    await new Promise<void>((resolve, reject) => {
      denied.on('error', () => {})
      denied.on('unexpected-response', (_request, response) => {
        const body: Buffer[] = []
        response.on('data', (chunk) => body.push(chunk))
        response.on('end', () => {
          try {
            expect(response.statusCode).toBe(403)
            expect(response.headers['retry-after']).toBe('30')
            expect(JSON.parse(Buffer.concat(body).toString())).toEqual({
              error: 'Connection denied.',
            })
            denied.terminate()
            resolve()
          } catch (error) {
            denied.terminate()
            reject(error)
          }
        })
      })
      denied.on('open', () => {
        denied.terminate()
        reject(
          new Error('An upgrade that should have been rejected succeeded.'),
        )
      })
    })
    expect(gate.events).toEqual(['開始'])
    for (const method of ['POST', 'TRACE']) {
      await new Promise<void>((resolve, reject) => {
        const request = httpRequest(
          url.replace('ws:', 'http:'),
          {
            method,
            headers: {
              connection: 'Upgrade',
              upgrade: 'websocket',
              'sec-websocket-protocol': 'graphql-transport-ws',
              'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
              'sec-websocket-version': '13',
            },
          },
          (response) => {
            response.resume()
            try {
              expect(response.statusCode).toBe(405)
              expect(response.headers.allow).toBe('GET')
              resolve()
            } catch (error) {
              reject(error)
            }
          },
        )
        request.on('error', reject)
        request.on('upgrade', (_response, socket) => {
          socket.destroy()
          reject(new Error(`Accepted an upgrade using ${method}.`))
        })
        request.end()
      })
    }
    expect(gate.events).toEqual(['開始'])
    const allowed = new WebSocket(url, ['graphql-transport-ws'])
    await once(allowed, 'open')
    await vi.waitFor(() =>
      expect(gate.events).toEqual(['開始', '開始', '終了']),
    )
    const closed = once(allowed, 'close')
    allowed.close()
    await closed
  } finally {
    await app.close()
  }
})
