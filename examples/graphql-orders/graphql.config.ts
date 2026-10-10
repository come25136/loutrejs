import type { GraphQLCodegenConfig } from '@loutrejs/cli'
export default {
  targets: {
    server: {
      kind: 'server',
      schema: ['contracts/*.graphql'],
      mappers: {
        OrderConnection: '../domain/commerce.js#OrderConnection',
        Order: '../domain/commerce.js#Order',
        OrderItem: '../domain/commerce.js#OrderItem',
        Customer: '../domain/commerce.js#Customer',
        Account: '../domain/commerce.js#Account',
        Product: '../domain/commerce.js#Product',
        Category: '../domain/commerce.js#Category',
      },
      output: 'src/generated',
    },
  },
} satisfies GraphQLCodegenConfig
