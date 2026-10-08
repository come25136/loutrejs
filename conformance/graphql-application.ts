import { buildSchema } from 'graphql'
import { graphql } from '@loutrejs/graphql'
import { defineApplication, defineModule, inject } from '@loutrejs/loutre'

class ConformanceState {
  cleanupCount = 0
}

export function graphQLConformanceApplication(http = true, path = '/graphql') {
  const schema = buildSchema(`
    type Query { hello: String!, cleanupCount: Int! }
    type Mutation { update(value: String!): String! }
    type Tick { sequence: Int!, hidden: String! }
    type Subscription { ticks: Tick! }
  `)
  const query = schema.getQueryType()!.getFields()
  query.hello!.resolve = () => 'Hello World'
  query.cleanupCount!.resolve = (
    _parent,
    _args,
    context: { state: ConformanceState },
  ) => context.state.cleanupCount
  schema.getMutationType()!.getFields().update!.resolve = (
    _parent,
    args: { value: string },
  ) => args.value
  const ticks = schema.getSubscriptionType()!.getFields().ticks!
  ticks.subscribe = async function* (
    _parent,
    _args,
    context: { signal: AbortSignal; state: ConformanceState },
  ) {
    try {
      yield { sequence: 1, hidden: 'private' }
      yield { sequence: 2, hidden: 'private' }
      if (!context.signal.aborted)
        await new Promise<void>((resolve) =>
          context.signal.addEventListener('abort', () => resolve(), {
            once: true,
          }),
        )
    } finally {
      context.state.cleanupCount++
    }
  }
  ticks.resolve = (event: unknown) => event
  const endpoint = graphql.endpoint({
    name: 'Conformance',
    path,
    schema,
    transports: { http, websocket: true },
    factory: (state = inject(ConformanceState)) => ({
      context: (input) => ({ signal: input.signal, state }),
    }),
  })
  const Module = defineModule(() => ({
    providers: [ConformanceState],
    executions: [endpoint],
  }))
  return defineApplication({ modules: [Module()] })
}
