import { buildSchema } from 'graphql'
import { graphql } from '@loutrejs/graphql'
import { defineApplication, defineModule } from '@loutrejs/loutre'

export function graphQLConformanceApplication(http = true, path = '/graphql') {
  const endpoint = graphql.endpoint({
    name: 'Conformance',
    path,
    schema: buildSchema(`
      type Query { hello: String!, cleanupCount: Int! }
      type Mutation { update(value: String!): String! }
      type Tick { sequence: Int!, hidden: String! }
      type Subscription { ticks: Tick! }
    `),
    transports: { http, websocket: true },
    factory: () => {
      let cleanupCount = 0
      return {
        context: (input) => ({ signal: input.signal }),
        rootValue: {
          hello: () => 'Hello World',
          cleanupCount: () => cleanupCount,
          update: ({ value }: { value: string }) => value,
          async *ticks(_args: unknown, context: { signal: AbortSignal }) {
            try {
              yield { ticks: { sequence: 1, hidden: 'private' } }
              yield { ticks: { sequence: 2, hidden: 'private' } }
              if (!context.signal.aborted)
                await new Promise<void>((resolve) =>
                  context.signal.addEventListener('abort', () => resolve(), {
                    once: true,
                  }),
                )
            } finally {
              cleanupCount += 1
            }
          },
        },
      }
    },
  })
  const Module = defineModule(() => ({ executions: [endpoint] }))
  return defineApplication({ modules: [Module()] })
}
