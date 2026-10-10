import { getFieldSelection } from '@loutrejs/graphql/data'
import type { AppContext } from './context.js'
import type { Resolvers } from '../generated/types.js'
export const resolvers = {
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
          throw new Error('商品の参照権限がありません。')
      },
      load: ({ parents: items, context, signal }) =>
        context.commerce.findProducts(items, signal),
    },
  },
} satisfies Resolvers<AppContext>
