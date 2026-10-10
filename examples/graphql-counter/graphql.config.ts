import type { GraphQLCodegenConfig } from '@loutrejs/cli'

export default {
  targets: {
    server: {
      kind: 'server',
      schema: ['contracts/*.graphql'],
      output: 'src/generated',
      mappers: {
        Counter: '../domain/counter.js#Counter',
        Step: '../domain/step.js#Step',
      },
    },
  },
} satisfies GraphQLCodegenConfig
