// @generated loutre graphql generateの出力です。直接編集しないでください。
import { createSchemaData } from '@loutrejs/graphql/data'
import type { SchemaFields } from './types.js'
export const createData = <Context extends object>() =>
  createSchemaData<SchemaFields<Context>>({
    Account: {
      id: 'Account.id',
      name: 'Account.name',
    },
    Category: {
      id: 'Category.id',
      name: 'Category.name',
    },
    Customer: {
      account: 'Customer.account',
      id: 'Customer.id',
    },
    Order: {
      customer: 'Order.customer',
      id: 'Order.id',
      items: 'Order.items',
    },
    OrderConnection: {
      edges: 'OrderConnection.edges',
      pageInfo: 'OrderConnection.pageInfo',
      totalCount: 'OrderConnection.totalCount',
    },
    OrderItem: {
      id: 'OrderItem.id',
      product: 'OrderItem.product',
      quantity: 'OrderItem.quantity',
    },
    PageInfo: {
      hasNextPage: 'PageInfo.hasNextPage',
      hasPreviousPage: 'PageInfo.hasPreviousPage',
    },
    Product: {
      category: 'Product.category',
      id: 'Product.id',
      name: 'Product.name',
    },
    Query: {
      orders: 'Query.orders',
      productBatchCount: 'Query.productBatchCount',
    },
  })
