import type { User } from '../auth/users.js'
import type { Resolvers } from '../generated/types.js'
import type { AppContext } from './context.js'

export const resolvers = {
  Query: { viewer: ({ context }) => context.users.get(context.currentUser.id) },
  Mutation: {
    renameViewer: ({ args, context }) =>
      context.users.rename(context.currentUser.id, args.name),
  },
  Subscription: {
    viewerChanged: {
      subscribe: ({ context }) =>
        context.users.watch(context.currentUser.id, context.signal),
      resolve: ({ parent }: { parent: User }) => parent,
    },
  },
} satisfies Resolvers<AppContext>
