// @generated loutre graphql generateの出力です。直接編集しないでください。
// fingerprint: 1019ddbefd93081317c0b508666094f140fcd3191c5394dcabbda6e414e0bdd2
import { Kind } from 'graphql'
import type { DocumentNode } from 'graphql'
import {
  bindManifest as bindRuntimeManifest,
  type GraphQLSchemaDocument,
  type GraphQLManifest,
} from '@loutrejs/graphql/runtime'
import type { SchemaContext, Resolvers } from './types.js'
export const schemaDocument: GraphQLSchemaDocument<SchemaContext> = {
  kind: Kind.DOCUMENT,
  definitions: [
    {
      kind: Kind.OBJECT_TYPE_DEFINITION,
      name: {
        kind: Kind.NAME,
        value: 'Query',
      },
      fields: [
        {
          kind: Kind.FIELD_DEFINITION,
          name: {
            kind: Kind.NAME,
            value: 'hello',
          },
          type: {
            kind: Kind.NON_NULL_TYPE,
            type: {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
                value: 'String',
              },
            },
          },
        },
        {
          kind: Kind.FIELD_DEFINITION,
          name: {
            kind: Kind.NAME,
            value: 'cleanupCount',
          },
          type: {
            kind: Kind.NON_NULL_TYPE,
            type: {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
                value: 'Int',
              },
            },
          },
        },
        {
          kind: Kind.FIELD_DEFINITION,
          name: {
            kind: Kind.NAME,
            value: 'at',
          },
          arguments: [
            {
              kind: Kind.INPUT_VALUE_DEFINITION,
              name: {
                kind: Kind.NAME,
                value: 'value',
              },
              type: {
                kind: Kind.NON_NULL_TYPE,
                type: {
                  kind: Kind.NAMED_TYPE,
                  name: {
                    kind: Kind.NAME,
                    value: 'DateTime',
                  },
                },
              },
            },
          ],
          type: {
            kind: Kind.NON_NULL_TYPE,
            type: {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
                value: 'DateTime',
              },
            },
          },
        },
        {
          kind: Kind.FIELD_DEFINITION,
          name: {
            kind: Kind.NAME,
            value: 'nullableTicks',
          },
          type: {
            kind: Kind.LIST_TYPE,
            type: {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
                value: 'Tick',
              },
            },
          },
        },
      ],
    },
    {
      kind: Kind.OBJECT_TYPE_DEFINITION,
      name: {
        kind: Kind.NAME,
        value: 'Mutation',
      },
      fields: [
        {
          kind: Kind.FIELD_DEFINITION,
          name: {
            kind: Kind.NAME,
            value: 'update',
          },
          arguments: [
            {
              kind: Kind.INPUT_VALUE_DEFINITION,
              name: {
                kind: Kind.NAME,
                value: 'value',
              },
              type: {
                kind: Kind.NON_NULL_TYPE,
                type: {
                  kind: Kind.NAMED_TYPE,
                  name: {
                    kind: Kind.NAME,
                    value: 'String',
                  },
                },
              },
            },
          ],
          type: {
            kind: Kind.NON_NULL_TYPE,
            type: {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
                value: 'String',
              },
            },
          },
        },
      ],
    },
    {
      kind: Kind.OBJECT_TYPE_DEFINITION,
      name: {
        kind: Kind.NAME,
        value: 'Tick',
      },
      fields: [
        {
          kind: Kind.FIELD_DEFINITION,
          name: {
            kind: Kind.NAME,
            value: 'sequence',
          },
          type: {
            kind: Kind.NON_NULL_TYPE,
            type: {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
                value: 'Int',
              },
            },
          },
        },
        {
          kind: Kind.FIELD_DEFINITION,
          name: {
            kind: Kind.NAME,
            value: 'hidden',
          },
          type: {
            kind: Kind.NON_NULL_TYPE,
            type: {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
                value: 'String',
              },
            },
          },
        },
      ],
    },
    {
      kind: Kind.OBJECT_TYPE_DEFINITION,
      name: {
        kind: Kind.NAME,
        value: 'Subscription',
      },
      fields: [
        {
          kind: Kind.FIELD_DEFINITION,
          name: {
            kind: Kind.NAME,
            value: 'ticks',
          },
          type: {
            kind: Kind.NON_NULL_TYPE,
            type: {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
                value: 'Tick',
              },
            },
          },
        },
      ],
    },
    {
      kind: Kind.SCALAR_TYPE_DEFINITION,
      name: {
        kind: Kind.NAME,
        value: 'DateTime',
      },
    },
  ],
}
export function bindManifest<Context extends object = SchemaContext>(input: {
  readonly schemaDocument: DocumentNode
  readonly resolvers: Resolvers<Context>
}): GraphQLManifest<Context> {
  return bindRuntimeManifest<Context>(input)
}
