import type { GraphQLCodegenConfig } from '@loutrejs/cli'
export default {
  targets: {
    server: {
      kind: 'server',
      schema: ['contracts/*.graphql'],
      resolvers: 'src/graphql/resolvers.ts',
      contextType: '../graphql/context.js#AppContext',
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
    client: {
      kind: 'client',
      schema: ['contracts/*.graphql'],
      documents: ['operations/*.graphql'],
      output: 'src/client/generated.ts',
    },
  },
} satisfies GraphQLCodegenConfig
