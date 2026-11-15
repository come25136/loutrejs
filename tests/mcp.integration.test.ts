import {
  bootstrapApplication,
  defineApplication,
  defineModule,
  inject,
  provide,
  token as createToken,
} from '@loutrejs/loutre'
import { nodeRuntime } from '@loutrejs/node'
import {
  bindHttpServer,
  http,
  type HttpContractRawRoute,
} from '@loutrejs/loutre/http'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { mcp } from '@loutrejs/mcp'

const resource = 'https://orders.example.test/mcp'
const issuer = 'https://id.example.test'
const metadata =
  'https://orders.example.test/.well-known/oauth-protected-resource/mcp'
const protocolVersion = '2026-07-28'
const defaultRoute = http.contract({
  mcp: { raw: true, method: '*', path: '/mcp' },
}).routes.mcp
const capabilities = [bindHttpServer({ runtime: 'test' })]
const OAuth = createToken<ReturnType<typeof oauthOptions>>('TestOAuth')

class OrdersService {
  count = 0
}

function fixture(
  options = oauthOptions(),
  route: HttpContractRawRoute = defaultRoute,
) {
  const inputTransform = vi.fn((id: string) => Number(id))
  const outputTransform = vi.fn((id: number) => String(id))
  const read = mcp.tool({
    name: 'orders.read',
    description: '注文を取得する',
    scopes: ['orders:read'],
    input: z.object({
      id: z.string().pipe(z.string().regex(/^\d+$/)).transform(inputTransform),
    }),
    output: z.object({
      id: z.number().transform(outputTransform).pipe(z.string()),
      count: z.number(),
      call: z.number(),
      subject: z.string(),
    }),
  })
  const write = mcp.tool({
    name: 'orders.write',
    description: '注文を更新する',
    scopes: ['orders:read', 'orders:write'],
    input: z.object({}),
    output: z.literal(true),
  })
  const server = mcp.implementation({
    route,
    name: 'orders',
    version: '1.0.0',
    tools: [write, read],
    oauth: { requiredScopes: options.requiredScopes },
    factory: (auth = inject(OAuth), orders = inject(OrdersService)) => ({
      oauth: auth,
      context: ({ principal, signal }) => ({ principal, signal, call: 0 }),
      tools: {
        'orders.read': ({ id }, context) => ({
          id,
          count: ++orders.count,
          call: ++context.call,
          subject: context.principal.subject,
        }),
        'orders.write': (): true => {
          orders.count++
          return true
        },
      },
    }),
  })
  const application = defineApplication({
    modules: [
      defineModule({
        providers: [OrdersService, provide(OAuth).useValue(options)],
        executions: [server],
      }),
    ],
  })
  return { application, inputTransform, outputTransform, read }
}

function oauthOptions(expectedResource = resource) {
  return {
    publicOrigin: new URL(expectedResource).origin,
    authorizationServers: [issuer],
    requiredScopes: ['orders:read'],
    verifyAccessToken: vi.fn((token: string) => {
      if (
        ![
          'read',
          'write',
          'wrong-resource',
          'wrong-issuer',
          'expired',
          'unscoped',
        ].includes(token)
      )
        return
      return {
        subject: token,
        issuer:
          token === 'wrong-issuer' ? 'https://other.example.test' : issuer,
        resource:
          token === 'wrong-resource'
            ? 'https://other.example.test/mcp'
            : expectedResource,
        scopes:
          token === 'write'
            ? ['orders:read', 'orders:write']
            : token === 'unscoped'
              ? []
              : ['orders:read'],
        expiresAt: token === 'expired' ? 1 : Date.now() / 1000 + 60,
      }
    }),
    allowInvocation: vi.fn(() => true),
  }
}

function oauthConfiguration(options = oauthOptions()) {
  return options
}

function rpc(
  method: string,
  params: Record<string, unknown> = {},
  token: string | undefined = 'read',
  headers: Record<string, string> = {},
) {
  return new Request(resource, {
    method: 'POST',
    headers: {
      host: 'orders.example.test',
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-method': method,
      'mcp-protocol-version': protocolVersion,
      ...(typeof params.name === 'string' ? { 'mcp-name': params.name } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
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
            name: 'test',
            version: '1.0.0',
          },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  })
}

describe('MCP Streamable HTTP', () => {
  it('Tool呼び出しをHTTP Execution配下のoperationとして追跡する', async () => {
    const executions: string[] = []
    const operations: string[] = []
    const { application } = fixture()
    await using app = await bootstrapApplication({
      application,
      capabilities,
      instrumentation: {
        beginExecution(event) {
          executions.push(event.executionKind)
          return { complete() {} }
        },
        beginOperation(event) {
          operations.push(event.kind)
          return { complete() {} }
        },
      },
    })
    const response = await app.http.fetch(
      rpc('tools/call', { name: 'orders.read', arguments: { id: '1' } }),
    )
    expect(response.status).toBe(200)
    await response.json()
    expect(executions).toEqual(['http.request'])
    expect(operations).toContain('mcp.tool')
  })

  it('MCP入口とOAuthメタデータの両方でHTTPルートの衝突を診断する', () => {
    const api = http.contract({
      mcp: { raw: true, method: '*', path: '/mcp' },
    })
    const endpoint = mcp.implementation({
      route: api.routes.mcp,
      name: 'orders',
      version: '1',
      tools: [],
      factory: () => ({
        oauth: oauthConfiguration(),
        context: () => ({}),
        tools: {},
      }),
    })
    const application = defineApplication({
      modules: [
        defineModule({
          executions: [
            endpoint,
            http.raw({
              route: { method: 'POST', path: '/mcp' },
              factory: () => () => new Response(),
            }),
            http.raw({
              route: {
                method: 'GET',
                path: '/.well-known/oauth-protected-resource/mcp',
              },
              factory: () => () => new Response(),
            }),
          ],
        }),
      ],
    })

    expect(
      application.model.diagnostics.filter(
        ({ code }) => code === 'LUTRE_HTTP_DUPLICATE_ROUTE',
      ),
    ).toHaveLength(2)
  })

  it('認可メタデータを公開し、無効なtokenを拒否する', async () => {
    await using app = await bootstrapApplication({
      application: fixture().application,
      capabilities,
    })
    const response = await app.http.fetch(
      new Request(metadata, { headers: { host: 'orders.example.test' } }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      resource,
      authorization_servers: [issuer],
      scopes_supported: ['orders:read'],
      bearer_methods_supported: ['header'],
    })

    const missingScope = await app.http.fetch(rpc('tools/list', {}, 'unscoped'))
    expect(missingScope.status).toBe(403)
    expect(missingScope.headers.get('www-authenticate')).toContain(
      'scope="orders:read"',
    )

    for (const token of [
      '',
      'unknown',
      'wrong-resource',
      'wrong-issuer',
      'expired',
    ]) {
      const rejected = await app.http.fetch(rpc('tools/list', {}, token))
      expect(rejected.status).toBe(401)
      expect(rejected.headers.get('www-authenticate')).toContain(
        `resource_metadata="${metadata}"`,
      )
    }
  })

  it('同じscopeで一覧と直接呼び出しを制御し、endpointのDIと呼び出しごとのContextを使う', async () => {
    const options = oauthOptions()
    const { application, inputTransform, outputTransform } = fixture(options)
    await using app = await bootstrapApplication({ application, capabilities })

    const readList = await app.http.fetch(rpc('tools/list'))
    expect(await readList.json()).toMatchObject({
      result: {
        tools: [
          {
            name: 'orders.read',
            inputSchema: { properties: { id: { type: 'string' } } },
            outputSchema: { properties: { id: { type: 'string' } } },
          },
        ],
        ttlMs: 0,
        cacheScope: 'private',
      },
    })
    const writeList = await app.http.fetch(rpc('tools/list', {}, 'write'))
    expect(await writeList.json()).toMatchObject({
      result: { tools: [{ name: 'orders.read' }, { name: 'orders.write' }] },
    })

    const denied = await app.http.fetch(
      rpc('tools/call', { name: 'orders.write' }),
    )
    expect(denied.status).toBe(403)
    expect(denied.headers.get('www-authenticate')).toContain(
      'scope="orders:read orders:write"',
    )
    expect(app.get(OrdersService).count).toBe(0)
    expect(options.allowInvocation).not.toHaveBeenCalled()

    const call = () =>
      app.http.fetch(
        rpc('tools/call', { name: 'orders.read', arguments: { id: '17' } }),
      )
    const results = await Promise.all(
      [call(), call()].map(async (value) => (await value).json()),
    )
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          result: expect.objectContaining({
            structuredContent: { id: '17', count: 1, call: 1, subject: 'read' },
          }),
        }),
        expect.objectContaining({
          result: expect.objectContaining({
            structuredContent: { id: '17', count: 2, call: 1, subject: 'read' },
          }),
        }),
      ]),
    )
    expect(inputTransform).toHaveBeenCalledTimes(2)
    expect(outputTransform).toHaveBeenCalledTimes(2)
    expect(app.get(OrdersService).count).toBe(2)
    const ordersProvider = app.graph.providers.find(
      ({ name }) => name === 'OrdersService',
    )
    expect(ordersProvider).toBeDefined()
    expect(
      app.graph.executions.find(
        (node) => node.executionKind === 'mcp.endpoint',
      ),
    ).toMatchObject({
      extension: {
        metadata: {
          tools: [
            expect.objectContaining({
              name: 'orders.read',
              scopes: ['orders:read'],
            }),
            expect.objectContaining({
              name: 'orders.write',
              scopes: ['orders:read', 'orders:write'],
            }),
          ],
        },
      },
    })
    expect(app.graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'delegates',
          from: 'orders.mcp.http',
          to: 'orders.mcp',
        }),
        expect.objectContaining({
          kind: 'delegates',
          from: 'orders.mcp.oauth-metadata',
          to: 'orders.mcp',
        }),
        expect.objectContaining({
          kind: 'injects',
          from: 'orders.mcp',
          to: ordersProvider?.id,
        }),
      ]),
    )
  })

  it('認可済み呼び出しの頻度を制限し、HostとOriginを検査する', async () => {
    const options = oauthOptions()
    options.allowInvocation.mockReturnValue(false)
    await using app = await bootstrapApplication({
      application: fixture(options).application,
      capabilities,
    })
    const request = () =>
      rpc('tools/call', { name: 'orders.read', arguments: { id: '17' } })
    expect(
      (
        await app.http.fetch(
          rpc('tools/list', {}, 'read', {
            origin: 'https://untrusted.example',
          }),
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await app.http.fetch(
          rpc('tools/list', {}, 'read', { host: 'untrusted.example' }),
        )
      ).status,
    ).toBe(403)
    expect(options.verifyAccessToken).not.toHaveBeenCalled()
    expect((await app.http.fetch(request())).status).toBe(429)
    expect(app.get(OrdersService).count).toBe(0)
  })

  it('不正な入力と未知のToolを区別し、認可前にルーティングヘッダーを信頼しない', async () => {
    await using app = await bootstrapApplication({
      application: fixture().application,
      capabilities,
    })
    const invalid = await app.http.fetch(
      rpc('tools/call', { name: 'orders.read', arguments: { id: 'invalid' } }),
    )
    expect(await invalid.json()).toMatchObject({ result: { isError: true } })
    const unknown = await app.http.fetch(
      rpc('tools/call', { name: 'orders.missing' }),
    )
    expect(await unknown.json()).toMatchObject({ error: { code: -32602 } })
    const mismatched = await app.http.fetch(
      rpc('tools/call', { name: 'orders.write' }, 'read', {
        'mcp-name': 'orders.read',
      }),
    )
    expect(await mismatched.json()).toMatchObject({ error: { code: -32020 } })
    expect(app.get(OrdersService).count).toBe(0)
  })

  it('通常のHTTPと同じlistenerで親branchのmiddlewareを継承する', async () => {
    const called = vi.fn()
    const observed = http.middleware({
      name: 'ObserveMcp',
      factory: () => async (_context, next) => {
        called()
        await next()
      },
    })
    const api = http.contract({
      api: {
        path: '/api',
        middlewares: [observed],
        routes: { mcp: { raw: true, method: '*', path: '/mcp' } },
      },
    })
    const nodeResource = 'https://127.0.0.1/api/mcp'
    const { application: mcpApplication } = fixture(
      oauthOptions(nodeResource),
      api.routes.mcp,
    )
    const other = http.raw({
      route: { method: 'GET', path: '/other' },
      factory: () => () => new Response('通常のHTTPルート'),
    })
    const application = defineApplication({
      modules: [
        ...mcpApplication.modules,
        defineModule({ executions: [other] }),
      ],
    })
    await using app = await nodeRuntime.create({
      application,
      shutdownHooks: false,
    })
    const { port } = await app.serve({ port: 0, hostname: '127.0.0.1' })
    const response = await fetch(
      `http://127.0.0.1:${port}/.well-known/oauth-protected-resource/api/mcp`,
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      resource: nodeResource,
    })
    expect(called).not.toHaveBeenCalled()
    const url = `http://127.0.0.1:${port}`
    const send = async (request: Request) => {
      request.headers.delete('host')
      return fetch(`${url}/api/mcp`, {
        method: request.method,
        headers: request.headers,
        body: await request.text(),
      })
    }
    const discovery = await send(rpc('server/discover'))
    expect(await discovery.json()).toMatchObject({
      result: {
        supportedVersions: [protocolVersion],
        capabilities: { tools: {} },
        _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'orders' } },
      },
    })
    const call = await send(
      rpc('tools/call', { name: 'orders.write' }, 'write'),
    )
    expect(await call.json()).toMatchObject({
      result: { structuredContent: true },
    })
    expect(await (await fetch(`${url}/other`)).text()).toBe('通常のHTTPルート')
    expect(called).toHaveBeenCalledTimes(2)
  })
})

it('endpointの非公開ProviderとTool契約の不正をModelで診断する', async () => {
  const { read } = fixture()
  const invalid = mcp.tool({
    name: 'invalid',
    description: '不正な入力',
    scopes: [],
    input: z.string(),
    output: z.string(),
  })
  const privateModule = defineModule({ providers: [OrdersService] })
  const route = (name: string) =>
    http.contract({ endpoint: { raw: true, method: '*', path: `/${name}` } })
      .routes.endpoint
  const factory = (orders = inject(OrdersService)) => ({
    oauth: oauthConfiguration(),
    context: () => ({}),
    tools: {
      'orders.read': ({ id }: { id: number }) => ({
        id,
        count: orders.count,
        call: 1,
        subject: 'read',
      }),
    },
  })
  const application = defineApplication({
    modules: [
      defineModule({
        imports: [privateModule],
        executions: [
          mcp.implementation({
            name: 'private',
            version: '1',
            route: route('private'),
            tools: [read],
            factory,
          }),
          mcp.implementation({
            name: 'duplicate',
            version: '1',
            route: route('duplicate'),
            tools: [read, read],
            factory,
          }),
          mcp.implementation({
            name: 'invalid',
            version: '1',
            route: route('invalid'),
            tools: [invalid],
            factory: () => ({
              oauth: oauthConfiguration(),
              context: () => ({}),
              tools: { invalid: (value) => value },
            }),
          }),
        ],
      }),
    ],
  })
  expect(application.model.diagnostics.map(({ code }) => code)).toEqual(
    expect.arrayContaining([
      'LUTRE_MODULE_VISIBILITY',
      'LUTRE_EXTENSION_COMPILE',
    ]),
  )
  expect(application.model.diagnostics.map(({ message }) => message)).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Tool名が重複'),
      expect.stringContaining('入力はオブジェクト'),
    ]),
  )
  await expect(bootstrapApplication({ application })).rejects.toThrow(
    'Application Model is invalid',
  )
})

it.each(['context', 'handler'])(
  '%s実行中の中断を伝え、完了までProviderを維持する',
  async (phase) => {
    const entered = Promise.withResolvers<void>()
    const cancelled = Promise.withResolvers<void>()
    const finish = Promise.withResolvers<void>()
    const destroy = vi.fn()
    const wait = async (signal: AbortSignal) => {
      signal.addEventListener('abort', () => cancelled.resolve(), {
        once: true,
      })
      entered.resolve()
      await finish.promise
    }
    class Dependency {
      onModuleDestroy() {
        destroy()
      }
    }
    const slow = mcp.tool({
      name: 'orders.slow',
      description: '時間のかかる照会を実行する',
      scopes: ['orders:read'],
      input: z.object({}),
      output: z.string(),
    })
    const application = defineApplication({
      modules: [
        defineModule({
          providers: [Dependency],
          executions: [
            mcp.implementation({
              route: defaultRoute,
              name: 'orders',
              version: '1',
              tools: [slow],
              factory: (dependency = inject(Dependency)) => ({
                oauth: oauthConfiguration(),
                context: async ({ signal }) => {
                  if (phase === 'context') await wait(signal)
                  return { signal }
                },
                tools: {
                  'orders.slow': async (_input, { signal }) => {
                    void dependency
                    if (phase === 'handler') await wait(signal)
                    return '完了'
                  },
                },
              }),
            }),
          ],
        }),
      ],
    })
    await using app = await bootstrapApplication({ application, capabilities })
    const controller = new AbortController()
    const calling = app.http.fetch(
      new Request(rpc('tools/call', { name: 'orders.slow' }), {
        signal: controller.signal,
      }),
    )
    await entered.promise
    try {
      controller.abort()
      await cancelled.promise
      const closing = app.close()
      expect((await app.http.fetch(rpc('tools/list'))).status).toBe(503)
      expect(destroy).not.toHaveBeenCalled()
      finish.resolve()
      await closing
      expect(destroy).toHaveBeenCalledOnce()
    } finally {
      finish.resolve()
      await calling
    }
  },
)
