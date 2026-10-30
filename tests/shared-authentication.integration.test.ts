import { once } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { parse } from 'graphql'
import { graphql } from '@loutrejs/graphql'
import { bindManifest } from '@loutrejs/graphql/runtime'
import {
  defineApplication,
  defineModule,
  inject,
  provide,
  token,
} from '@loutrejs/loutre'
import {
  bearerAuth,
  http,
  type BearerAuthenticator,
} from '@loutrejs/loutre/http'
import { nodeRuntime } from '@loutrejs/node'

describe('HTTPとGraphQLの共通認証', () => {
  it('同じDIサービスでHTTP・GraphQL HTTP・GraphQL WSを認証しidentityを分離する', async () => {
    type User = { id: string }
    const authenticate = vi.fn<BearerAuthenticator<User>>((value) =>
      ['alice', 'bob'].includes(value) ? { id: value } : null,
    )
    const Sessions = token<{ authenticate: BearerAuthenticator<User> }>(
      '認証サービス',
    )
    const auth = bearerAuth({
      realm: 'test',
      factory: (sessions = inject(Sessions)) => ({
        authenticate: (value, input) => sessions.authenticate(value, input),
        unauthorized: () => new Response(null, { status: 401 }),
      }),
    })
    const profile = http.raw({
      name: 'Profile',
      route: { method: 'GET', path: '/profile', middlewares: [auth] },
      factory:
        () =>
        async ({ state }) =>
          Response.json({ id: state.identity.id }),
    })
    const manifest = bindManifest<{ identity: User }>({
      schemaDocument: parse('type Query { viewer: ID! }'),
      resolvers: {
        Query: {
          viewer: ({ context }: { context: { identity: User } }) =>
            context.identity.id,
        },
      },
    })
    const endpoint = graphql.endpoint({
      name: 'Api',
      path: '/graphql',
      manifest,
      transports: { http: true, websocket: true },
      factory: (sessions = inject(Sessions)) => ({
        authenticate: (value, input) => sessions.authenticate(value, input),
        context: ({ identity }) => ({ identity }),
      }),
    })
    const Module = defineModule(() => ({
      providers: [provide(Sessions).useValue({ authenticate })],
      executions: [profile, endpoint],
    }))
    const app = await nodeRuntime.create({
      application: defineApplication({ modules: [Module()] }),
    })
    const { server } = await app.serve({
      port: 0,
      hostname: '127.0.0.1',
      shutdownHooks: false,
    })
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    let socket: WebSocket | undefined
    try {
      const [profileResponse, query] = await Promise.all([
        fetch(`${base}/profile`, {
          headers: { authorization: 'Bearer alice' },
        }),
        fetch(`${base}/graphql?query=%7Bviewer%7D`, {
          headers: { authorization: 'Bearer bob' },
        }),
      ])
      expect(await profileResponse.json()).toEqual({ id: 'alice' })
      expect(await query.json()).toEqual({ data: { viewer: 'bob' } })
      socket = new WebSocket(`${base.replace('http:', 'ws:')}/graphql`, [
        'graphql-transport-ws',
      ])
      await once(socket, 'open')
      let received = once(socket, 'message')
      socket.send(
        JSON.stringify({
          type: 'connection_init',
          payload: { authorization: 'Bearer alice' },
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
          payload: { query: '{viewer}' },
        }),
      )
      expect(JSON.parse(String((await received)[0]))).toEqual({
        id: 'q',
        type: 'next',
        payload: { data: { viewer: 'alice' } },
      })
      expect(authenticate).toHaveBeenCalledTimes(4)
      expect(
        authenticate.mock.calls.map(([value]) => value).toSorted(),
      ).toEqual(['alice', 'alice', 'alice', 'bob'])
      expect((await fetch(`${base}/profile`)).status).toBe(401)
      expect((await fetch(`${base}/graphql?query=%7Bviewer%7D`)).status).toBe(
        401,
      )
      expect(authenticate).toHaveBeenCalledTimes(4)
    } finally {
      socket?.terminate()
      await app.close()
    }
  })
})
