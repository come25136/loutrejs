// @generated loutre graphql generateの出力です。直接編集しないでください。
// 入力指紋: 0c8526bd8d6de2fff5c4cdee99247687bf5433a3e67325d95aad741c80d9be5c
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
export type Maybe<T> = T | null
export type InputMaybe<T> = Maybe<T>
export type Scalars = {
  ID: {
    input: string
    output: string
  }
  String: {
    input: string
    output: string
  }
  Boolean: {
    input: boolean
    output: boolean
  }
  Int: {
    input: number
    output: number
  }
  Float: {
    input: number
    output: number
  }
}
export type Strategy = 'EAGER' | 'LAZY' | 'HYBRID'
export type OrderFilter = {
  readonly customerId?: InputMaybe<Scalars['ID']['input']>
}
export type PaginationInput = {
  readonly offset?: Scalars['Int']['input']
  readonly limit?: Scalars['Int']['input']
}
export type PageInfo = {
  readonly __typename?: 'PageInfo'
  readonly hasPreviousPage: Scalars['Boolean']['output']
  readonly hasNextPage: Scalars['Boolean']['output']
}
export type OrderConnection = {
  readonly __typename?: 'OrderConnection'
  readonly totalCount: Scalars['Int']['output']
  readonly pageInfo: PageInfo
  readonly edges: ReadonlyArray<Order>
}
export type Order = {
  readonly __typename?: 'Order'
  readonly id: Scalars['ID']['output']
  readonly customer: Customer
  readonly items: ReadonlyArray<OrderItem>
}
export type Customer = {
  readonly __typename?: 'Customer'
  readonly id: Scalars['ID']['output']
  readonly account: Account
}
export type Account = {
  readonly __typename?: 'Account'
  readonly id: Scalars['ID']['output']
  readonly name: Scalars['String']['output']
}
export type OrderItem = {
  readonly __typename?: 'OrderItem'
  readonly id: Scalars['ID']['output']
  readonly quantity: Scalars['Int']['output']
  readonly product: Product
}
export type Product = {
  readonly __typename?: 'Product'
  readonly id: Scalars['ID']['output']
  readonly name: Scalars['String']['output']
  readonly category: Category
}
export type Category = {
  readonly __typename?: 'Category'
  readonly id: Scalars['ID']['output']
  readonly name: Scalars['String']['output']
}
export type Query = {
  readonly __typename?: 'Query'
  readonly orders: OrderConnection
  readonly productBatchCount: Scalars['Int']['output']
}
export type QueryordersArgs = {
  filter?: OrderFilter
  pagination?: PaginationInput
  strategy?: Strategy
}
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
export const OrdersWithDetailsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: {
        kind: 'Name',
        value: 'OrdersWithDetails',
      },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: {
              kind: 'Name',
              value: 'strategy',
            },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: {
                kind: 'Name',
                value: 'Strategy',
              },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: {
              kind: 'Name',
              value: 'orders',
            },
            arguments: [
              {
                kind: 'Argument',
                name: {
                  kind: 'Name',
                  value: 'strategy',
                },
                value: {
                  kind: 'Variable',
                  name: {
                    kind: 'Name',
                    value: 'strategy',
                  },
                },
              },
              {
                kind: 'Argument',
                name: {
                  kind: 'Name',
                  value: 'pagination',
                },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: {
                        kind: 'Name',
                        value: 'offset',
                      },
                      value: {
                        kind: 'IntValue',
                        value: '0',
                      },
                    },
                    {
                      kind: 'ObjectField',
                      name: {
                        kind: 'Name',
                        value: 'limit',
                      },
                      value: {
                        kind: 'IntValue',
                        value: '100',
                      },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: {
                    kind: 'Name',
                    value: 'totalCount',
                  },
                },
                {
                  kind: 'Field',
                  name: {
                    kind: 'Name',
                    value: 'pageInfo',
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: {
                          kind: 'Name',
                          value: 'hasPreviousPage',
                        },
                      },
                      {
                        kind: 'Field',
                        name: {
                          kind: 'Name',
                          value: 'hasNextPage',
                        },
                      },
                      {
                        kind: 'Field',
                        name: {
                          kind: 'Name',
                          value: '__typename',
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: {
                    kind: 'Name',
                    value: 'edges',
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: {
                          kind: 'Name',
                          value: 'id',
                        },
                      },
                      {
                        kind: 'Field',
                        name: {
                          kind: 'Name',
                          value: 'customer',
                        },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: {
                                kind: 'Name',
                                value: 'id',
                              },
                            },
                            {
                              kind: 'Field',
                              name: {
                                kind: 'Name',
                                value: 'account',
                              },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'Field',
                                    name: {
                                      kind: 'Name',
                                      value: 'id',
                                    },
                                  },
                                  {
                                    kind: 'Field',
                                    name: {
                                      kind: 'Name',
                                      value: 'name',
                                    },
                                  },
                                  {
                                    kind: 'Field',
                                    name: {
                                      kind: 'Name',
                                      value: '__typename',
                                    },
                                  },
                                ],
                              },
                            },
                            {
                              kind: 'Field',
                              name: {
                                kind: 'Name',
                                value: '__typename',
                              },
                            },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: {
                          kind: 'Name',
                          value: 'items',
                        },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: {
                                kind: 'Name',
                                value: 'id',
                              },
                            },
                            {
                              kind: 'Field',
                              name: {
                                kind: 'Name',
                                value: 'quantity',
                              },
                            },
                            {
                              kind: 'Field',
                              name: {
                                kind: 'Name',
                                value: 'product',
                              },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'Field',
                                    name: {
                                      kind: 'Name',
                                      value: 'id',
                                    },
                                  },
                                  {
                                    kind: 'Field',
                                    name: {
                                      kind: 'Name',
                                      value: 'name',
                                    },
                                  },
                                  {
                                    kind: 'Field',
                                    name: {
                                      kind: 'Name',
                                      value: 'category',
                                    },
                                    selectionSet: {
                                      kind: 'SelectionSet',
                                      selections: [
                                        {
                                          kind: 'Field',
                                          name: {
                                            kind: 'Name',
                                            value: 'name',
                                          },
                                        },
                                        {
                                          kind: 'Field',
                                          name: {
                                            kind: 'Name',
                                            value: '__typename',
                                          },
                                        },
                                      ],
                                    },
                                  },
                                  {
                                    kind: 'Field',
                                    name: {
                                      kind: 'Name',
                                      value: '__typename',
                                    },
                                  },
                                ],
                              },
                            },
                            {
                              kind: 'Field',
                              name: {
                                kind: 'Name',
                                value: '__typename',
                              },
                            },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: {
                          kind: 'Name',
                          value: '__typename',
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: {
                    kind: 'Name',
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
} as unknown as DocumentNode<
  OrdersWithDetailsQuery,
  OrdersWithDetailsQueryVariables
>
