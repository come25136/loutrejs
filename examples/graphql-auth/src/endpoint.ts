import { graphql } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { Users } from './auth/users.js'
import { authenticate } from './auth/authentication.js'
import { bindManifest } from './generated/bindings.js'
import { schemaDocument } from './generated/schema-ast.js'
import { resolvers } from './graphql/resolvers.js'
import type { AppContext } from './graphql/context.js'

const manifest = bindManifest<AppContext>({ schemaDocument, resolvers })

export const AuthenticatedGraphQL = graphql.endpoint({
  name: 'AuthenticatedGraphQL',
  path: '/graphql',
  manifest,
  transports: { http: true, websocket: true },
  factory: (users = inject(Users)) => ({
    state: (input) => authenticate(users, input),
    context: ({ state, signal }) => ({
      currentUser: state.currentUser,
      users,
      signal,
    }),
  }),
})
