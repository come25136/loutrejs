import type { AppContext } from './context.js'
import { GraphQLScalarType } from 'graphql'
import type { Resolvers } from './generated/types.js'
export const resolvers = {
  DateTime: new GraphQLScalarType({
    name: 'DateTime',
    serialize: (value) => (value as Date).toISOString(),
    parseValue: (value) => new Date(String(value)),
  }),
  Query: {
    at: (_parent, args) => args.value,
    nullableTicks: () => [null],
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
} satisfies Resolvers<AppContext>
