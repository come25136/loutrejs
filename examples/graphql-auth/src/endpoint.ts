import { graphql } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { Users } from './auth/users.js'
import { Connections } from './auth/connections.js'
import { authentication } from './auth/http.js'
import { bindManifest } from './generated/bindings.js'
import { schemaDocument } from './generated/schema-ast.js'
import { resolvers } from './graphql/resolvers.js'
import type { AppContext } from './graphql/context.js'

const manifest = bindManifest<AppContext>({ schemaDocument, resolvers })

export const AuthenticatedGraphQL = graphql.endpoint({
  name: 'AuthenticatedGraphQL',
  path: '/graphql',
  manifest,
  transports: { http: { middlewares: [authentication] }, websocket: true },
  factory: (users = inject(Users), connections = inject(Connections)) => ({
    websocket: {
      onConnect: ({ extra, connectionParams }) =>
        connections.connect(extra.request, connectionParams, extra.signal),
      onClose: ({ extra }) => connections.disconnect(extra.request),
    },
    context: (input) => ({
      currentUser:
        input.transport === 'http'
          ? input.state.currentUser
          : connections.requireUser(input.request),
      users,
      signal: input.signal,
    }),
  }),
})
