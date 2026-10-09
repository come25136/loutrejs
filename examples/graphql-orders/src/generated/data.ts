// @generated loutre graphql generateの出力です。直接編集しないでください。
// 入力指紋: ad91d979bbcf1c7f62680b788972dab150fca86baf5344016ae7928239a7d19d
import { createSchemaData } from '@loutrejs/graphql/data'
import type { SchemaFields } from './types.js'
export const createData = () =>
  createSchemaData<SchemaFields>(
    {
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
    },
    'ad91d979bbcf1c7f62680b788972dab150fca86baf5344016ae7928239a7d19d',
  )
