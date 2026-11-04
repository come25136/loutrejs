// @generated loutre graphql generateの出力です。直接編集しないでください。
import { Kind, OperationTypeNode } from 'graphql'
type Exact<
  T extends {
    [key: string]: unknown
  },
> = {
  [K in keyof T]: T[K]
}
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never
    }
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core'
export type Strategy = 'EAGER' | 'LAZY' | 'HYBRID'
export type OrdersWithDetailsQueryVariables = Exact<{
  strategy: Strategy
}>
export type OrdersWithDetailsQuery = {
  readonly orders: {
    readonly __typename: 'OrderConnection'
    readonly totalCount: number
    readonly pageInfo: {
      readonly __typename: 'PageInfo'
      readonly hasPreviousPage: boolean
      readonly hasNextPage: boolean
    }
    readonly edges: ReadonlyArray<{
      readonly __typename: 'Order'
      readonly id: string
      readonly customer: {
        readonly __typename: 'Customer'
        readonly id: string
        readonly account: {
          readonly __typename: 'Account'
          readonly id: string
          readonly name: string
        }
      }
      readonly items: ReadonlyArray<{
        readonly __typename: 'OrderItem'
        readonly id: string
        readonly quantity: number
        readonly product: {
          readonly __typename: 'Product'
          readonly id: string
          readonly name: string
          readonly category: {
            readonly __typename: 'Category'
            readonly name: string
          }
        }
      }>
    }>
  }
}
export const OrdersWithDetailsDocument: DocumentNode<
  OrdersWithDetailsQuery,
  OrdersWithDetailsQueryVariables
> = {
  kind: Kind.DOCUMENT,
  definitions: [
    {
      kind: Kind.OPERATION_DEFINITION,
      operation: OperationTypeNode.QUERY,
      name: {
        kind: Kind.NAME,
        value: 'OrdersWithDetails',
      },
      variableDefinitions: [
        {
          kind: Kind.VARIABLE_DEFINITION,
          variable: {
            kind: Kind.VARIABLE,
            name: {
              kind: Kind.NAME,
              value: 'strategy',
            },
          },
          type: {
            kind: Kind.NON_NULL_TYPE,
            type: {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
                value: 'Strategy',
              },
            },
          },
        },
      ],
      selectionSet: {
        kind: Kind.SELECTION_SET,
        selections: [
          {
            kind: Kind.FIELD,
            name: {
              kind: Kind.NAME,
              value: 'orders',
            },
            arguments: [
              {
                kind: Kind.ARGUMENT,
                name: {
                  kind: Kind.NAME,
                  value: 'strategy',
                },
                value: {
                  kind: Kind.VARIABLE,
                  name: {
                    kind: Kind.NAME,
                    value: 'strategy',
                  },
                },
              },
              {
                kind: Kind.ARGUMENT,
                name: {
                  kind: Kind.NAME,
                  value: 'pagination',
                },
                value: {
                  kind: Kind.OBJECT,
                  fields: [
                    {
                      kind: Kind.OBJECT_FIELD,
                      name: {
                        kind: Kind.NAME,
                        value: 'offset',
                      },
                      value: {
                        kind: Kind.INT,
                        value: '0',
                      },
                    },
                    {
                      kind: Kind.OBJECT_FIELD,
                      name: {
                        kind: Kind.NAME,
                        value: 'limit',
                      },
                      value: {
                        kind: Kind.INT,
                        value: '100',
                      },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: Kind.SELECTION_SET,
              selections: [
                {
                  kind: Kind.FIELD,
                  name: {
                    kind: Kind.NAME,
                    value: 'totalCount',
                  },
                },
                {
                  kind: Kind.FIELD,
                  name: {
                    kind: Kind.NAME,
                    value: 'pageInfo',
                  },
                  selectionSet: {
                    kind: Kind.SELECTION_SET,
                    selections: [
                      {
                        kind: Kind.FIELD,
                        name: {
                          kind: Kind.NAME,
                          value: 'hasPreviousPage',
                        },
                      },
                      {
                        kind: Kind.FIELD,
                        name: {
                          kind: Kind.NAME,
                          value: 'hasNextPage',
                        },
                      },
                      {
                        kind: Kind.FIELD,
                        name: {
                          kind: Kind.NAME,
                          value: '__typename',
                        },
                      },
                    ],
                  },
                },
                {
                  kind: Kind.FIELD,
                  name: {
                    kind: Kind.NAME,
                    value: 'edges',
                  },
                  selectionSet: {
                    kind: Kind.SELECTION_SET,
                    selections: [
                      {
                        kind: Kind.FIELD,
                        name: {
                          kind: Kind.NAME,
                          value: 'id',
                        },
                      },
                      {
                        kind: Kind.FIELD,
                        name: {
                          kind: Kind.NAME,
                          value: 'customer',
                        },
                        selectionSet: {
                          kind: Kind.SELECTION_SET,
                          selections: [
                            {
                              kind: Kind.FIELD,
                              name: {
                                kind: Kind.NAME,
                                value: 'id',
                              },
                            },
                            {
                              kind: Kind.FIELD,
                              name: {
                                kind: Kind.NAME,
                                value: 'account',
                              },
                              selectionSet: {
                                kind: Kind.SELECTION_SET,
                                selections: [
                                  {
                                    kind: Kind.FIELD,
                                    name: {
                                      kind: Kind.NAME,
                                      value: 'id',
                                    },
                                  },
                                  {
                                    kind: Kind.FIELD,
                                    name: {
                                      kind: Kind.NAME,
                                      value: 'name',
                                    },
                                  },
                                  {
                                    kind: Kind.FIELD,
                                    name: {
                                      kind: Kind.NAME,
                                      value: '__typename',
                                    },
                                  },
                                ],
                              },
                            },
                            {
                              kind: Kind.FIELD,
                              name: {
                                kind: Kind.NAME,
                                value: '__typename',
                              },
                            },
                          ],
                        },
                      },
                      {
                        kind: Kind.FIELD,
                        name: {
                          kind: Kind.NAME,
                          value: 'items',
                        },
                        selectionSet: {
                          kind: Kind.SELECTION_SET,
                          selections: [
                            {
                              kind: Kind.FIELD,
                              name: {
                                kind: Kind.NAME,
                                value: 'id',
                              },
                            },
                            {
                              kind: Kind.FIELD,
                              name: {
                                kind: Kind.NAME,
                                value: 'quantity',
                              },
                            },
                            {
                              kind: Kind.FIELD,
                              name: {
                                kind: Kind.NAME,
                                value: 'product',
                              },
                              selectionSet: {
                                kind: Kind.SELECTION_SET,
                                selections: [
                                  {
                                    kind: Kind.FIELD,
                                    name: {
                                      kind: Kind.NAME,
                                      value: 'id',
                                    },
                                  },
                                  {
                                    kind: Kind.FIELD,
                                    name: {
                                      kind: Kind.NAME,
                                      value: 'name',
                                    },
                                  },
                                  {
                                    kind: Kind.FIELD,
                                    name: {
                                      kind: Kind.NAME,
                                      value: 'category',
                                    },
                                    selectionSet: {
                                      kind: Kind.SELECTION_SET,
                                      selections: [
                                        {
                                          kind: Kind.FIELD,
                                          name: {
                                            kind: Kind.NAME,
                                            value: 'name',
                                          },
                                        },
                                        {
                                          kind: Kind.FIELD,
                                          name: {
                                            kind: Kind.NAME,
                                            value: '__typename',
                                          },
                                        },
                                      ],
                                    },
                                  },
                                  {
                                    kind: Kind.FIELD,
                                    name: {
                                      kind: Kind.NAME,
                                      value: '__typename',
                                    },
                                  },
                                ],
                              },
                            },
                            {
                              kind: Kind.FIELD,
                              name: {
                                kind: Kind.NAME,
                                value: '__typename',
                              },
                            },
                          ],
                        },
                      },
                      {
                        kind: Kind.FIELD,
                        name: {
                          kind: Kind.NAME,
                          value: '__typename',
                        },
                      },
                    ],
                  },
                },
                {
                  kind: Kind.FIELD,
                  name: {
                    kind: Kind.NAME,
                    value: '__typename',
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
}
