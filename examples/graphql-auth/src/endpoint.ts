import { graphql } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { Users } from './auth/users.js'
import {
  httpBearerAuthentication,
  wsBearerAuthentication,
} from './auth/bearer.js'
import {
  httpApiKeyAuthentication,
  wsApiKeyAuthentication,
} from './auth/api-key.js'
import { bindManifest } from './generated/bindings.js'
import { schemaDocument } from './generated/schema-ast.js'
import { resolvers } from './graphql/resolvers.js'
import type { AppContext } from './graphql/context.js'

const manifest = bindManifest<AppContext>({ schemaDocument, resolvers })

export const ProfileBearerGraphQL = graphql.endpoint({
  name: 'ProfileBearerGraphQL',
  path: '/graphql/bearer',
  manifest,
  http: { middlewares: [httpBearerAuthentication] },
  ws: { connectionInit: [wsBearerAuthentication] },
  factory: (users = inject(Users)) => ({
    context: ({ state, signal }) => ({
      currentUser: state.currentUser,
      users,
      signal,
    }),
  }),
})

export const ProfileApiKeyGraphQL = graphql.endpoint({
  name: 'ProfileApiKeyGraphQL',
  path: '/graphql/api-key',
  manifest,
  http: { middlewares: [httpApiKeyAuthentication] },
  ws: { connectionInit: [wsApiKeyAuthentication] },
  factory: (users = inject(Users)) => ({
    context: ({ state, signal }) => ({
      currentUser: state.currentUser,
      users,
      signal,
    }),
  }),
})
