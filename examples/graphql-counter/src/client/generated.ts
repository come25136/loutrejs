// @generated loutre graphql generateの出力です。直接編集しないでください。
// 入力指紋: 6f08754bf07e2e63d6deabb3ee6a04a91860a052abcbf2bd0b847e1b93b293f1
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
export type Counter = {
  readonly __typename?: 'Counter'
  readonly value: Scalars['Int']['output']
  readonly step: Step
}
export type Step = {
  readonly __typename?: 'Step'
  readonly id: Scalars['ID']['output']
  readonly amount: Scalars['Int']['output']
}
export type Query = {
  readonly __typename?: 'Query'
  readonly counter: Counter
  readonly activeSubscriptions: Scalars['Int']['output']
  readonly stepBatchCount: Scalars['Int']['output']
}
export type Mutation = {
  readonly __typename?: 'Mutation'
  readonly increment: Counter
  readonly reset: Counter
}
export type MutationincrementArgs = {
  amount?: Scalars['Int']['input']
}
export type MutationresetArgs = {
  value?: Scalars['Int']['input']
}
export type Subscription = {
  readonly __typename?: 'Subscription'
  readonly counterChanged: Counter
}
export type SnapshotQueryVariables = Exact<{
  [key: string]: never
}>
export type SnapshotQuery = {
  readonly activeSubscriptions: number
  readonly counter: {
    readonly value: number
    readonly step: {
      readonly amount: number
    }
  }
}
export type AddMutationVariables = Exact<{
  amount: number
}>
export type AddMutation = {
  readonly increment: {
    readonly value: number
  }
}
export type WatchSubscriptionVariables = Exact<{
  [key: string]: never
}>
export type WatchSubscription = {
  readonly counterChanged: {
    readonly value: number
    readonly step: {
      readonly amount: number
    }
  }
}
export const SnapshotDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: {
        kind: 'Name',
        value: 'Snapshot',
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: {
              kind: 'Name',
              value: 'counter',
            },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: {
                    kind: 'Name',
                    value: 'value',
                  },
                },
                {
                  kind: 'Field',
                  name: {
                    kind: 'Name',
                    value: 'step',
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: {
                          kind: 'Name',
                          value: 'amount',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: {
              kind: 'Name',
              value: 'activeSubscriptions',
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SnapshotQuery, SnapshotQueryVariables>
export const AddDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: {
        kind: 'Name',
        value: 'Add',
      },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: {
              kind: 'Name',
              value: 'amount',
            },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: {
                kind: 'Name',
                value: 'Int',
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
              value: 'increment',
            },
            arguments: [
              {
                kind: 'Argument',
                name: {
                  kind: 'Name',
                  value: 'amount',
                },
                value: {
                  kind: 'Variable',
                  name: {
                    kind: 'Name',
                    value: 'amount',
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
                    value: 'value',
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AddMutation, AddMutationVariables>
export const WatchDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'subscription',
      name: {
        kind: 'Name',
        value: 'Watch',
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: {
              kind: 'Name',
              value: 'counterChanged',
            },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: {
                    kind: 'Name',
                    value: 'value',
                  },
                },
                {
                  kind: 'Field',
                  name: {
                    kind: 'Name',
                    value: 'step',
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: {
                          kind: 'Name',
                          value: 'amount',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<WatchSubscription, WatchSubscriptionVariables>
