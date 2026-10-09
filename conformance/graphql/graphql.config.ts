export default {
  targets: {
    server: {
      kind: 'server',
      scalars: { DateTime: { input: 'Date', output: 'Date' } },
      schema: ['schema.graphql'],
      output: 'generated',
      resolvers: 'resolvers.ts',
      contextType: '../context.js#AppContext',
    },
  },
}
