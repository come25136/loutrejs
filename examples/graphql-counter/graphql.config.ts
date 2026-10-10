import type { GraphQLCodegenConfig } from '@loutrejs/cli'

export default {
  targets: {
    server: {
      kind: 'server',
      schema: ['contracts/*.graphql'],
      output: 'src/generated',
      contextType: '../graphql/context.js#AppContext',
      mappers: {
        Counter: '../domain/counter.js#Counter',
        Step: '../domain/step.js#Step',
      },
    },
  },
} satisfies GraphQLCodegenConfig
