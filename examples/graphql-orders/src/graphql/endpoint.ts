import { graphql, getFieldSelection } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { CommerceService } from '../domain/commerce.js'
import type { createApiContract } from '../http/contract.js'
import { bindManifest } from './generated/bindings.js'
import { schemaDocument } from './generated/schema-ast.js'

export interface AppContext {
  readonly commerce: CommerceService
  readonly signal: AbortSignal
}

export const manifest = bindManifest<AppContext>({
  schemaDocument,
  resolvers: {
    Query: {
      orders: {
        resolve: ({ args, context, info }) =>
          context.commerce.search({
            ...args,
            selection: getFieldSelection(info),
            signal: context.signal,
          }),
      },
      productBatchCount: ({ context }) => context.commerce.productBatchCount,
    },
    Order: {
      customer: {
        requires: ['customerId'],
        load: ({ parents: orders, context, signal }) => {
          signal.throwIfAborted()
          return orders.map((order) =>
            context.commerce.customer(order.customerId),
          )
        },
      },
    },
    OrderItem: {
      product: {
        requires: ['productId', 'tenant', 'revision'],
        authorize: ({ parent }) => {
          if (parent.tenant !== 'demo')
            throw new Error('Product access denied.')
        },
        load: ({ parents: items, context, signal }) =>
          context.commerce.findProducts(items, signal),
      },
    },
  },
})

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
