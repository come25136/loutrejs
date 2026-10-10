// @generated loutre graphql generateの出力です。直接編集しないでください。
// fingerprint: 9998cd77979a3341de177c98c02b25aee37d1e626fd39c88098c24f92b94706b
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
        value: 'Counter',
      },
      fields: [
        {
          kind: Kind.FIELD_DEFINITION,
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
                value: 'Int',
              },
            },
          },
        },
        {
          kind: Kind.FIELD_DEFINITION,
          name: {
            kind: Kind.NAME,
            value: 'step',
          },
          type: {
            kind: Kind.NON_NULL_TYPE,
            type: {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
                value: 'Step',
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
        value: 'Step',
      },
      fields: [
        {
          kind: Kind.FIELD_DEFINITION,
          name: {
            kind: Kind.NAME,
            value: 'id',
          },
          type: {
            kind: Kind.NON_NULL_TYPE,
            type: {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
                value: 'ID',
              },
            },
          },
        },
        {
          kind: Kind.FIELD_DEFINITION,
          name: {
            kind: Kind.NAME,
            value: 'amount',
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
      ],
    },
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
            value: 'counter',
          },
          type: {
            kind: Kind.NON_NULL_TYPE,
            type: {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
                value: 'Counter',
              },
            },
          },
        },
        {
          kind: Kind.FIELD_DEFINITION,
          name: {
            kind: Kind.NAME,
            value: 'activeSubscriptions',
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
            value: 'stepBatchCount',
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
            value: 'increment',
          },
          arguments: [
            {
              kind: Kind.INPUT_VALUE_DEFINITION,
              name: {
                kind: Kind.NAME,
                value: 'amount',
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
              defaultValue: {
                kind: Kind.INT,
                value: '1',
              },
            },
          ],
          type: {
            kind: Kind.NON_NULL_TYPE,
            type: {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
                value: 'Counter',
              },
            },
          },
        },
        {
          kind: Kind.FIELD_DEFINITION,
          name: {
            kind: Kind.NAME,
            value: 'reset',
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
                    value: 'Int',
                  },
                },
              },
              defaultValue: {
                kind: Kind.INT,
                value: '0',
              },
            },
          ],
          type: {
            kind: Kind.NON_NULL_TYPE,
            type: {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
                value: 'Counter',
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
            value: 'counterChanged',
          },
          type: {
            kind: Kind.NON_NULL_TYPE,
            type: {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
                value: 'Counter',
              },
            },
          },
        },
      ],
    },
  ],
}
export function bindManifest<Context extends object = SchemaContext>(input: {
  readonly schemaDocument: DocumentNode
  readonly resolvers: Resolvers<Context>
}): GraphQLManifest<Context> {
  return bindRuntimeManifest<Context>(input)
}
