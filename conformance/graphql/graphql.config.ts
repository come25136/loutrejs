export default {
  targets: {
    counterClient: {
      kind: 'client',
      schema: ['../../examples/graphql-counter/contracts/*.graphql'],
      documents: ['operations/counter/*.graphql'],
      output: 'client/counter.ts',
    },
    ordersClient: {
      kind: 'client',
      schema: ['../../examples/graphql-orders/contracts/*.graphql'],
      documents: ['operations/orders/*.graphql'],
      output: 'client/orders.ts',
    },
    server: {
      kind: 'server',
      scalars: { DateTime: { input: 'Date', output: 'Date' } },
      schema: ['schema.graphql'],
      output: 'generated',
      contextType: '../context.js#AppContext',
    },
  },
}
