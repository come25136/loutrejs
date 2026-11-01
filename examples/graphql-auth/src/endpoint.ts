import { ApiContract } from './contract.js'
import { graphql, ConnectionRejected } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { Users } from './auth/users.js'
import { bindManifest } from './generated/bindings.js'
import { schemaDocument } from './generated/schema-ast.js'
import { resolvers } from './graphql/resolvers.js'
import type { AppContext } from './graphql/context.js'

const manifest = bindManifest<AppContext>({ schemaDocument, resolvers })

export const ProfileGraphQL = graphql.implementation({
  name: 'ProfileGraphQL',
  route: ApiContract.routes.graphql,
  manifest,

  ws: true,
  factory: (users = inject(Users)) => ({
    ws: {
      connectionInit: ({ payload }) => {
        const user = users.authenticate({
          authorization: payload?.authorization,
          apiKey: payload?.apiKey,
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
