import { graphql, ConnectionRejected } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { Users, type User } from '../auth/users.js'
import type { AuthState } from '../auth/state.js'
import { ApiContract } from '../http/contract.js'
import { bindManifest } from './generated/bindings.js'
import { schemaDocument } from './generated/schema-ast.js'

export interface AppContext extends AuthState {
  readonly users: Users
  readonly signal: AbortSignal
}

export const manifest = bindManifest<AppContext>({
  schemaDocument,
  resolvers: {
    Query: {
      viewer: ({ context }) => context.users.get(context.currentUser.id),
    },
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
  },
})

export const ProfileGraphQL = graphql.implementation({
  name: 'ProfileGraphQL',
  route: ApiContract.routes.graphql,
  manifest,
  transports: { http: true, websocket: true },
  factory: (users = inject(Users)) => ({
    ws: {
      connectionInit: ({ payload }) => {
        const user = users.authenticate({
          authorization: payload?.authorization,
          apiKey: payload?.apiKey,
        })
        if (!user) return new ConnectionRejected('Authentication required.')

        return { currentUser: { id: user.id } }
      },
    },

    context: ({ state, signal }) => {
      if (!state.currentUser) throw new Error('Authenticated user is missing.')

      return { currentUser: state.currentUser, users, signal }
    },
  }),
})
