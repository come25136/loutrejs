import { graphql } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { CommerceService } from '../domain/commerce.js'
import type { createApiContract } from '../http/contract.js'
import { manifest } from './manifest.js'

type OrdersRoute = ReturnType<typeof createApiContract>['routes']['graphql']

export function createOrdersGraphQL(route: OrdersRoute) {
  return graphql.implementation({
    name: 'Orders',
    route,
    manifest,
    transports: { http: true, websocket: true },
    factory: (commerce = inject(CommerceService)) => ({
      context: ({ signal }) => ({ commerce, signal }),
    }),
  })
}
