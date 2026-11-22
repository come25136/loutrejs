import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { mcp } from '@loutrejs/mcp'
import { application, module, inject, provide } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { nodeRuntime } from '@loutrejs/node'

const issuer = 'https://issuer.example.test'
const protocolVersion = '2026-07-28'

function call(url: string, token: string, tenant: string) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${token}`,
      'x-tenant': tenant,
      'mcp-method': 'tools/call',
      'mcp-name': 'counter.read',
      'mcp-protocol-version': protocolVersion,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'counter.read',
        arguments: {},
        _meta: {
          'io.modelcontextprotocol/protocolVersion': protocolVersion,
          'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  })
}

describe('MCP endpointの所有権', () => {
  it.each([false, true])(
    '初期化順が逆=%sでも同じlistener上のendpointごとにDI・OAuth・Context・Tool名を分離する',
    async (reverse) => {
      let constructions = 0
      let invocations = 0
      let nextResource = 0
      class Resource {
        readonly id = ++nextResource
      }
      const layer = http.middleware<{ tenant: string }>({
        name: 'Tenant',
        factory:
          () =>
          async ({ request }, next) =>
            next({ tenant: request.headers.get('x-tenant') ?? '' }),
      })
      const CounterReadContract = mcp.contract({
        'counter.read': {
          description: '状態を取得する',
          scopes: ['read'],
          input: z.strictObject({}),
          output: z.object({
            endpoint: z.string(),
            count: z.number(),
            resource: z.number(),
            tenant: z.string(),
            subject: z.string(),
          }),
        },
      })
      const create = (name: string) =>
        mcp.implementation({
          name,
          version: '1',
          route: http.contract({
            endpoint: {
              raw: true,
              method: '*',
              path: `/${name}/mcp`,
              middlewares: [layer],
            },
          }).routes.endpoint,
          contract: CounterReadContract,
          oauth: { requiredScopes: ['read'] },
          factory: (resource = inject(Resource)) => {
            constructions += 1
            let count = 0
            return {
              oauth: {
                publicOrigin: 'https://127.0.0.1',
                authorizationServers: [issuer],
                verifyAccessToken(token: string) {
                  return token === name
                    ? {
                        subject: token,
                        issuer,
                        resource: `https://127.0.0.1/${name}/mcp`,
                        expiresAt: Date.now() / 1000 + 60,
                        scopes: ['read'],
                      }
                    : undefined
                },
                allowInvocation: () => true,
              },
              tools: {
                'counter.read': (
                  _input,
                  { principal, state, signal, request },
                ) => {
                  invocations += 1
                  expect(new URL(request.url).pathname).toBe(`/${name}/mcp`)
                  signal.throwIfAborted()
                  return {
                    endpoint: name,
                    count: ++count,
                    resource: resource.id,
                    tenant: state.tenant,
                    subject: principal.subject,
                  }
                },
              },
            }
          },
        })
      const appDefinition = application({
        modules: [
          module({
            providers: [
              provide(Resource).useClass(Resource, { scope: 'transient' }),
            ],
            executions: [create('first'), create('second')].map((endpoint) => ({
              ...endpoint,
              executions: reverse
                ? endpoint.executions.toReversed()
                : endpoint.executions,
            })),
          }),
        ],
      })
      expect(appDefinition.model.diagnostics).toEqual([])
      expect(
        appDefinition.model.executions.filter(
          (node) => node.executionKind === 'mcp.endpoint',
        ),
      ).toHaveLength(2)
      expect(
        appDefinition.model.executions.some(
          (node) => node.executionKind === 'mcp.tool',
        ),
      ).toBe(false)
      constructions = 0
      const resultSchema = z.object({
        result: z.object({
          structuredContent: CounterReadContract.tools['counter.read'].output,
        }),
      })
      const resources = new Set<number>()
      for (let index = 0; index < 2; index += 1) {
        await using app = await nodeRuntime.create({
          application: appDefinition,
          shutdownHooks: false,
        })
        const { port } = await app.serve({ hostname: '127.0.0.1', port: 0 })
        expect(constructions).toBe((index + 1) * 2)
        const origin = `http://127.0.0.1:${port}`
        for (const name of ['first', 'second']) {
          const metadata = await fetch(
            `${origin}/.well-known/oauth-protected-resource/${name}/mcp`,
          )
          expect(metadata.status).toBe(200)
          expect(await metadata.json()).toMatchObject({
            resource: `https://127.0.0.1/${name}/mcp`,
          })
          const before = invocations
          expect(
            (
              await call(
                `${origin}/${name}/mcp`,
                name === 'first' ? 'second' : 'first',
                'denied',
              )
            ).status,
          ).toBe(401)
          expect(invocations).toBe(before)
          const first = resultSchema.parse(
            await (await call(`${origin}/${name}/mcp`, name, 'tenant1')).json(),
          ).result.structuredContent
          const second = resultSchema.parse(
            await (await call(`${origin}/${name}/mcp`, name, 'tenant2')).json(),
          ).result.structuredContent
          expect(first).toEqual({
            endpoint: name,
            count: 1,
            resource: first.resource,
            tenant: 'tenant1',
            subject: name,
          })
          expect(second).toEqual({ ...first, count: 2, tenant: 'tenant2' })
          expect(resources.has(first.resource)).toBe(false)
          resources.add(first.resource)
        }
      }
      expect(resources.size).toBe(4)
    },
  )
})
