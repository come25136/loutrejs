import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  bootstrapApplication,
  application,
  module,
  assertDeclaredExecutionMethods,
  resolveExecutionMethod,
} from '@loutrejs/loutre'
import {
  bindHttpServer,
  http,
  type HttpHandlerContext,
  type HttpHandlers,
} from '@loutrejs/loutre/http'
import {
  bindWebSocketServer,
  websocket,
  type WebSocketCloseInfo,
  type WebSocketHandlerContext,
} from '@loutrejs/loutre/websocket'
import { mcp, type McpRuntime, type McpOAuthRuntime } from '@loutrejs/mcp'

const contract = http.contract({
  echo: {
    method: 'GET',
    path: '/echo',
    responses: { ok: { status: 200, body: z.string() } },
  },
})
type HttpContext = HttpHandlerContext<typeof contract, 'echo'>
class HttpController {
  #message() {
    return '応答'
  }
  echo(_context: HttpContext) {
    return { schema: contract.echo.ok, body: this.#message() }
  }
}
const factories: Record<string, () => HttpHandlers<typeof contract>> = {
  prototype上のmethod: () => new HttpController(),
  非列挙のmethod: () =>
    Object.defineProperty(
      {
        echo: (_context: HttpContext) => ({
          schema: contract.echo.ok,
          body: '応答',
        }),
      },
      'echo',
      { enumerable: false },
    ),
  契約外のプロパティ: () => ({
    echo: () => ({ schema: contract.echo.ok, body: '応答' }),
    metadata: '設定',
    get unrelated() {
      throw new Error('契約外の参照')
    },
  }),
}

describe('protocolのmethod契約', () => {
  it('継承で隠れたメソッドを数えず、クラスのコンストラクタをhandlerに使わない', () => {
    class Base {
      helper() {
        return '継承元'
      }
    }
    const instance = Object.defineProperty(new Base(), 'helper', {
      value: '設定',
    })
    expect(() => assertDeclaredExecutionMethods(instance, [])).not.toThrow()
    expect(resolveExecutionMethod(instance, 'constructor')).toBeUndefined()
    const handlers = {
      constructor() {
        return '明示した応答'
      },
    }
    expect(() => assertDeclaredExecutionMethods(handlers, [])).toThrow(
      'constructor',
    )
    expect(resolveExecutionMethod(handlers, 'constructor')?.()).toBe(
      '明示した応答',
    )
  })

  it.each(Object.entries(factories))(
    'HTTPは%sを持つhandlerを利用できる',
    async (_, factory) => {
      await using app = await bootstrapApplication({
        application: application({
          modules: [
            module({
              executions: [http.implementation({ contract, factory })],
            }),
          ],
        }),
        capabilities: [bindHttpServer({ runtime: 'test' })],
      })
      const response = await app.http.fetch(
        new Request('http://fixture.test/echo'),
      )
      expect(response.status).toBe(200)
      await expect(response.text()).resolves.toBe('応答')
    },
  )

  it('WebSocketはprototype上のmethodを元のinstanceで呼び出す', async () => {
    const wsContract = websocket.contract({ echo: { path: '/ws' } })
    class Controller {
      #message = '応答'
      async echo(
        context: WebSocketHandlerContext<typeof wsContract.routes.echo>,
      ) {
        await context.close(1000, this.#message)
      }
    }
    let finish!: (info: WebSocketCloseInfo) => void
    const closed = new Promise<WebSocketCloseInfo>((resolve) => {
      finish = resolve
    })
    await using app = await bootstrapApplication({
      application: application({
        modules: [
          module({
            executions: [
              websocket.implementation({
                contract: wsContract,
                factory: () => new Controller(),
              }),
            ],
          }),
        ],
      }),
      capabilities: [
        bindWebSocketServer({
          runtime: 'test',
          async upgrade() {
            return {
              response: new Response(),
              connection: {
                protocol: '',
                messages: (async function* () {})(),
                closed,
                async send() {},
                async close(code = 1000, reason = '') {
                  finish({ code, reason, wasClean: true })
                },
                terminate() {
                  finish({ code: 1006, reason: '', wasClean: false })
                },
              },
            }
          },
        }),
      ],
    })
    await app.websocket.upgrade(new Request('http://fixture.test/ws'))
    await expect(closed).resolves.toMatchObject({ code: 1000, reason: '応答' })
  })

  const EchoContract = mcp.contract({
    echo: {
      description: '確認',
      scopes: [],
      input: z.object({}),
      output: z.object({ text: z.string(), count: z.number() }),
    },
  })
  class OAuth implements McpOAuthRuntime {
    readonly publicOrigin = 'https://fixture.test'
    readonly authorizationServers = ['https://issuer.test']
    #subject = 'user'
    verifyAccessToken() {
      return {
        subject: this.#subject,
        issuer: this.authorizationServers[0]!,
        resource: `${this.publicOrigin}/mcp`,
        expiresAt: Date.now() / 1000 + 60,
        scopes: [],
      }
    }
    allowInvocation() {
      return this.#subject === 'user'
    }
  }
  class Tools {
    #count = 0
    echo() {
      return { text: '応答', count: ++this.#count }
    }
  }
  class Runtime implements McpRuntime<typeof EchoContract> {
    readonly oauth = new OAuth()
    readonly tools = new Tools()
  }
  const toolFactories: Record<string, () => McpRuntime<typeof EchoContract>> = {
    prototype上のmethod: () => new Runtime(),
    非列挙のmethod: () => ({
      oauth: new OAuth(),
      tools: Object.defineProperty(
        { echo: () => ({ text: '応答', count: 1 }) },
        'echo',
        { enumerable: false },
      ),
    }),
    契約外のプロパティ: () => ({
      oauth: new OAuth(),
      tools: {
        echo: () => ({ text: '応答', count: 1 }),
        metadata: '設定',
        get unrelated() {
          throw new Error('契約外の参照')
        },
      },
    }),
  }
  it.each(Object.entries(toolFactories))(
    'MCPは%sを持つToolとOAuthのmethodを利用できる',
    async (_, factory) => {
      const endpoint = mcp.implementation({
        name: 'check',
        version: '1',
        route: http.contract({
          endpoint: { raw: true, method: '*', path: '/mcp' },
        }).routes.endpoint,
        contract: EchoContract,
        oauth: {},
        factory,
      })
      await using app = await bootstrapApplication({
        application: application({
          modules: [module({ executions: [endpoint] })],
        }),
        capabilities: [bindHttpServer({ runtime: 'test' })],
      })
      const response = await app.http.fetch(
        new Request('https://fixture.test/mcp', {
          method: 'POST',
          headers: {
            host: 'fixture.test',
            authorization: 'Bearer valid',
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            'mcp-method': 'tools/call',
            'mcp-name': 'echo',
            'mcp-protocol-version': '2026-07-28',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'echo',
              arguments: {},
              _meta: {
                'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                'io.modelcontextprotocol/clientInfo': {
                  name: 'test',
                  version: '1',
                },
                'io.modelcontextprotocol/clientCapabilities': {},
              },
            },
          }),
        }),
      )
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        result: { structuredContent: { text: '応答', count: 1 } },
      })
    },
  )
})
