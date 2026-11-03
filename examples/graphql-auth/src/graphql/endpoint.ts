import { graphql, ConnectionRejected } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { Users } from '../auth/users.js'
import { ApiContract } from '../http/contract.js'
import { manifest } from './manifest.js'

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
