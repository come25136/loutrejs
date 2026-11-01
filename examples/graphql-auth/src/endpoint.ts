import { ApiContract } from './contract.js'
import { graphql, ConnectionRejected } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { Users } from './auth/users.js'
import { bindManifest } from './generated/bindings.js'
import { schemaDocument } from './generated/schema-ast.js'
import { resolvers } from './graphql/resolvers.js'
import type { AppContext } from './graphql/context.js'

const manifest = bindManifest<AppContext>({ schemaDocument, resolvers })

export const ProfileBearerGraphQL = graphql.implementation({
  name: 'ProfileBearerGraphQL',
  route: ApiContract.routes.bearer,
  manifest,

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

export const ProfileApiKeyGraphQL = graphql.implementation({
  name: 'ProfileApiKeyGraphQL',
  route: ApiContract.routes.apiKey,
  manifest,

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
