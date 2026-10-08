// このファイルはloutre graphql generateが生成します。直接編集しないでください。
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
  __typename?: 'Counter'
  value: Scalars['Int']['output']
  step: Step
}
export type Step = {
  __typename?: 'Step'
  id: Scalars['ID']['output']
  amount: Scalars['Int']['output']
}
export type Query = {
  __typename?: 'Query'
  counter: Counter
  activeSubscriptions: Scalars['Int']['output']
  stepBatchCount: Scalars['Int']['output']
}
export type Mutation = {
  __typename?: 'Mutation'
  increment: Counter
  reset: Counter
}
export type MutationIncrementArgs = {
  amount?: Scalars['Int']['input']
}
export type MutationResetArgs = {
  value?: Scalars['Int']['input']
}
export type Subscription = {
  __typename?: 'Subscription'
  counterChanged: Counter
}
export type SnapshotQueryVariables = Exact<{
  [key: string]: never
}>
export type SnapshotQuery = {
  activeSubscriptions: number
  counter: {
    value: number
    step: {
      amount: number
    }
  }
}
export type AddMutationVariables = Exact<{
  amount: number
}>
export type AddMutation = {
  increment: {
    value: number
  }
}
export type WatchSubscriptionVariables = Exact<{
  [key: string]: never
}>
export type WatchSubscription = {
  counterChanged: {
    value: number
    step: {
      amount: number
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
