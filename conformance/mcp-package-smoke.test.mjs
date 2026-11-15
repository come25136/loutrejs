import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defineApplication, defineModule, inject } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { mcp } from '@loutrejs/mcp'
import { nodeRuntime } from '@loutrejs/node'
import { z } from 'zod'

const protocolVersion = '2026-07-28'
const issuer = 'https://issuer.example.test'

test('配布パッケージで MCP Tool を公開し、scope に応じて実行できる', async () => {
  class Counter {
    value = 0
  }

  const input = z.strictObject({})
  const output = z.object({ value: z.number() })
  const read = mcp.tool({
    name: 'counter.get',
    description: '現在値を取得する',
    scopes: ['counter:read'],
    input,
    output,
  })
  const write = mcp.tool({
    name: 'counter.increment',
    description: '現在値に 1 を加算する',
    scopes: ['counter:write'],
    input,
    output,
  })
  const resource = 'https://127.0.0.1/mcp'
  const Api = http.contract({ mcp: { raw: true, method: '*', path: '/mcp' } })
  const implementation = mcp.implementation({
    route: Api.routes.mcp,
    name: 'smoke',
    version: '1.0.0',
    tools: [read, write],
    oauth: { requiredScopes: ['counter:read'] },
    factory: (counter = inject(Counter)) => ({
      oauth: {
        publicOrigin: 'https://127.0.0.1',
        authorizationServers: [issuer],
        verifyAccessToken(token) {
          if (token !== 'read' && token !== 'write') return undefined
          return {
            subject: token,
            issuer,
            resource,
            expiresAt: Date.now() / 1000 + 60,
            scopes:
              token === 'read'
                ? ['counter:read']
                : ['counter:read', 'counter:write'],
          }
        },
        allowInvocation: () => true,
      },
      context: ({ principal, signal }) => ({ principal, signal }),
      tools: {
        'counter.get': () => ({ value: counter.value }),
        'counter.increment': () => ({ value: ++counter.value }),
      },
    }),
  })
  const application = defineApplication({
    modules: [
      defineModule({ providers: [Counter], executions: [implementation] }),
    ],
  })
  const app = await nodeRuntime.create({ application, shutdownHooks: false })
  try {
    const { port } = await app.serve({ hostname: '127.0.0.1', port: 0 })
    const endpoint = new URL(`http://127.0.0.1:${port}/mcp`)

    function request(method, token, params = {}) {
      return fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(5_000),
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-method': method,
          'mcp-protocol-version': protocolVersion,
          ...(params.name ? { 'mcp-name': params.name } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params: {
            ...params,
            _meta: {
              'io.modelcontextprotocol/protocolVersion': protocolVersion,
              'io.modelcontextprotocol/clientInfo': {
                name: 'smoke',
                version: '1.0.0',
              },
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        }),
      })
    }

    async function result(method, token, params) {
      const response = await request(method, token, params)
      const body = await response.json()
      assert.equal(response.status, 200, JSON.stringify(body))
      assert.ok(body.result, JSON.stringify(body))
      return body.result
    }

    const unauthenticated = await request('tools/list')
    assert.equal(unauthenticated.status, 401)
    assert.match(
      unauthenticated.headers.get('www-authenticate') ?? '',
      /resource_metadata="https:\/\/127\.0\.0\.1\/\.well-known\/oauth-protected-resource\/mcp"/,
    )
    await unauthenticated.json()

    const list = await result('tools/list', 'read')
    assert.deepEqual(
      list.tools.map(({ name }) => name),
      ['counter.get'],
    )

    const denied = await request('tools/call', 'read', {
      name: 'counter.increment',
    })
    assert.equal(denied.status, 403)
    assert.equal((await denied.json()).error, 'insufficient_scope')

    const changed = await result('tools/call', 'write', {
      name: 'counter.increment',
    })
    assert.deepEqual(changed.structuredContent, { value: 1 })
    const current = await result('tools/call', 'read', { name: 'counter.get' })
    assert.deepEqual(current.structuredContent, { value: 1 })
  } finally {
    await app.close()
  }
})
