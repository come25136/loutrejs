import type { GraphQLCodegenConfig } from '@loutrejs/cli'

export default {
  targets: {
    server: {
      kind: 'server',
      schema: ['contracts/*.graphql'],
      output: 'src/generated',
      mappers: { User: '../auth/users.js#User' },
    },
  },
} satisfies GraphQLCodegenConfig
