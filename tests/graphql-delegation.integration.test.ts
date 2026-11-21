import { buildSchema } from 'graphql'
import { createClient, type Client } from 'graphql-ws'
import WebSocket from 'ws'
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { graphql } from '@loutrejs/graphql'
import {
  bootstrapApplication,
  application as createApplication,
  module,
  inject,
  projectApplicationModel,
  provide,
} from '@loutrejs/loutre'
import { bindHttpServer, http } from '@loutrejs/loutre/http'
import { nodeRuntime } from '@loutrejs/node'
import { manifestFromSchema } from './helpers/graphql-manifest.js'

const resultSchema = z.object({
  data: z.object({ count: z.number(), resource: z.number() }),
})
const query = '{ count resource }'

function websocketQuery(client: Client): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let result: unknown
    client.subscribe(
      { query },
      {
        next(value) {
          result = value
        },
        error: reject,
        complete() {
          resolve(result)
        },
      },
    )
  })
}

describe('GraphQL endpointへの委任', () => {
  it.each([false, true])(
    'Extensionの初期化順が逆=%sでもruntimeとtransientをendpoint単位で共有しApplication間で分離する',
    async (reverse) => {
      let nextResource = 0
      let constructions = 0
      class Resource {
        readonly id = ++nextResource
      }
      const schema = buildSchema('type Query { count: Int!, resource: Int! }')
      schema.getQueryType()!.getFields().count!.resolve = (
        _parent,
        _args,
        context: { count: number },
      ) => context.count
      schema.getQueryType()!.getFields().resource!.resolve = (
        _parent,
        _args,
        context: { resource: number },
      ) => context.resource
      const manifest = manifestFromSchema(schema)
      const createEndpoint = (name: string, path: string) =>
        graphql.implementation({
          name,
          route: http.contract({ endpoint: { raw: true, method: '*', path } })
            .routes.endpoint,
          manifest,
          transports: { websocket: true },
          factory: (resource = inject(Resource)) => {
            constructions += 1
            let count = 0
            return {
              context: () => ({ count: ++count, resource: resource.id }),
            }
          },
        })
      const first = createEndpoint('First', '/first')
      const second = createEndpoint('Second', '/second')
      const application = createApplication({
        modules: [
          module({
            providers: [
              provide(Resource).useClass(Resource, { scope: 'transient' }),
            ],
            executions: [first, second].map((endpoint) => ({
              ...endpoint,
              executions: reverse
                ? endpoint.executions.toReversed()
                : endpoint.executions,
            })),
          }),
        ],
      })
      expect(application.model.diagnostics).toEqual([])
      const graph = projectApplicationModel(application.model)
      const endpoints = graph.executions.filter(
        (node) => node.executionKind === 'graphql.endpoint',
      )
      expect(endpoints).toHaveLength(2)
      const provider = graph.providers.find((node) => node.name === 'Resource')!
      expect(
        graph.edges
          .filter((edge) => edge.kind === 'injects' && edge.to === provider.id)
          .map((edge) => edge.from)
          .toSorted(),
      ).toEqual(endpoints.map((node) => node.id).toSorted())
      for (const endpoint of endpoints) {
        expect(
          graph.edges.filter(
            (edge) => edge.kind === 'delegates' && edge.to === endpoint.id,
          ),
        ).toHaveLength(2)
      }
      constructions = 0
      const resources = new Set<number>()
      for (let index = 0; index < 2; index += 1) {
        await using app = await nodeRuntime.create({
          application,
          shutdownHooks: false,
        })
        const { port } = await app.serve({ hostname: '127.0.0.1', port: 0 })
        expect(constructions).toBe((index + 1) * 2)
        for (const path of ['/first', '/second']) {
          const url = `http://127.0.0.1:${port}${path}`
          const httpResult = resultSchema.parse(
            await (
              await fetch(`${url}?query=${encodeURIComponent(query)}`)
            ).json(),
          )
          expect(httpResult.data.count).toBe(1)
          expect(resources.has(httpResult.data.resource)).toBe(false)
          resources.add(httpResult.data.resource)
          const client = createClient({
            url: url.replace('http:', 'ws:'),
            webSocketImpl: WebSocket,
          })
          try {
            const wsResult = resultSchema.parse(await websocketQuery(client))
            expect(wsResult.data).toEqual({
              count: 2,
              resource: httpResult.data.resource,
            })
          } finally {
            await client.dispose()
          }
          const next = resultSchema.parse(
            await (
              await fetch(`${url}?query=${encodeURIComponent(query)}`)
            ).json(),
          )
          expect(next.data).toEqual({
            count: 3,
            resource: httpResult.data.resource,
          })
        }
      }
      expect(resources.size).toBe(4)
    },
  )

  it('endpointの初期化が失敗した場合はProviderの終了と解放を実行する', async () => {
    const events: string[] = []
    const failure = new Error('endpointの初期化に失敗しました。')
    class Resource {
      start() {
        throw failure
      }
      onModuleDestroy() {
        events.push('destroy')
      }
      onApplicationDispose() {
        events.push('dispose')
      }
    }
    const schema = buildSchema('type Query { value: String }')
    schema.getQueryType()!.getFields().value!.resolve = () => 'value'
    const endpoint = graphql.implementation({
      name: 'Failure',
      route: http.contract({
        endpoint: { raw: true, method: '*', path: '/graphql' },
      }).routes.endpoint,
      manifest: manifestFromSchema(schema),
      factory: (resource = inject(Resource)) => {
        resource.start()
        return { context: () => ({}) }
      },
    })
    const application = createApplication({
      modules: [module({ providers: [Resource], executions: [endpoint] })],
    })
    expect(application.model.diagnostics).toEqual([])
    await expect(
      bootstrapApplication({
        application,
        capabilities: [bindHttpServer({ runtime: 'test' })],
      }),
    ).rejects.toBe(failure)
    expect(events).toEqual(['destroy', 'dispose'])
  })
})
