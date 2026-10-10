import type { AppContext } from './context.js'
import { createData } from '../generated/data.js'
import type { Resolvers } from '../generated/types.js'
const d = createData<AppContext>()
export const resolvers = {
  Query: {
    orders: d.Query.orders.source(({ args, context, demand, signal }) =>
      context.commerce.search({ ...args, demand, signal }),
    ),
    productBatchCount: (_parent, _args, context) =>
      context.commerce.productBatchCount,
  },
  Order: {
    customer: d.Order.customer.field({
      requires: ['customerId'],
      load: (orders, { context, signal }) => {
        signal.throwIfAborted()
        return orders.map((order) =>
          context.commerce.customer(order.customerId),
        )
      },
    }),
  },
  OrderItem: {
    product: d.OrderItem.product.field({
      requires: ['productId', 'tenant', 'revision'],
      authorize: ({ parent }) => {
        if (parent.tenant !== 'demo')
          throw new Error('商品の参照権限がありません。')
      },
      load: (items, { context, signal }) =>
        context.commerce.findProducts(items, signal),
    }),
  },
} satisfies Resolvers<AppContext>
