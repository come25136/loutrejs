import { graphql, ConnectionRejected } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { Users } from './auth/users.js'
import { httpBearerAuthentication } from './auth/bearer.js'
import { httpApiKeyAuthentication } from './auth/api-key.js'
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
  ws: true,
  factory: (users = inject(Users)) => ({
    ws: {
      connectionInit: ({ payload }) => {
        const user = users.authenticate({
          authorization: payload?.authorization,
        })
        if (!user) return new ConnectionRejected('認証が必要です。')
        return { currentUser: { id: user.id } }
      },
    },
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
  ws: true,
  factory: (users = inject(Users)) => ({
    ws: {
      connectionInit: ({ payload }) => {
        const user = users.authenticate({ apiKey: payload?.apiKey })
        if (!user) return new ConnectionRejected('認証が必要です。')
        return { currentUser: { id: user.id } }
      },
    },
    context: ({ state, signal }) => ({
      currentUser: state.currentUser,
      users,
      signal,
    }),
  }),
})
