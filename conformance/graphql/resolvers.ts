import { GraphQLScalarType } from 'graphql'
import { createData } from './generated/data.js'
import type { Resolvers } from './generated/types.js'
const d = createData()
export const resolvers = {
  DateTime: new GraphQLScalarType({
    name: 'DateTime',
    serialize: (value) => (value as Date).toISOString(),
    parseValue: (value) => new Date(String(value)),
  }),
  Query: {
    at: d.Query.at.source(({ args }) => args.value),
    nullableTicks: d.Query.nullableTicks.source(() => [null]),
    hello: () => 'Hello World',
    cleanupCount: (_parent, _args, context) => context.state.cleanupCount,
  },
  Mutation: { update: (_parent, { value }) => value },
  Subscription: {
    ticks: {
      subscribe: async function* (_parent, _args, context) {
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
      },
      resolve: (event: { sequence: number; hidden: string }) => event,
    },
  },
} satisfies Resolvers
