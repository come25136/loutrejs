// @generated loutre graphql generateの出力です。直接編集しないでください。
// fingerprint: 40e7ac12dd6e3ff1be44d54590aa180cfcbec999906aee6e2b1ac14143cd0dfa
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
export const SnapshotDocument: DocumentNode<
  SnapshotQuery,
  SnapshotQueryVariables
> = {
  kind: Kind.DOCUMENT,
  definitions: [
    {
      kind: Kind.OPERATION_DEFINITION,
      operation: OperationTypeNode.QUERY,
      name: {
        kind: Kind.NAME,
        value: 'Snapshot',
      },
      selectionSet: {
        kind: Kind.SELECTION_SET,
        selections: [
          {
            kind: Kind.FIELD,
            name: {
              kind: Kind.NAME,
              value: 'counter',
            },
            selectionSet: {
              kind: Kind.SELECTION_SET,
              selections: [
                {
                  kind: Kind.FIELD,
                  name: {
                    kind: Kind.NAME,
                    value: 'value',
                  },
                },
                {
                  kind: Kind.FIELD,
                  name: {
                    kind: Kind.NAME,
                    value: 'step',
                  },
                  selectionSet: {
                    kind: Kind.SELECTION_SET,
                    selections: [
                      {
                        kind: Kind.FIELD,
                        name: {
                          kind: Kind.NAME,
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
            kind: Kind.FIELD,
            name: {
              kind: Kind.NAME,
              value: 'activeSubscriptions',
            },
          },
        ],
      },
    },
  ],
}
export const AddDocument: DocumentNode<AddMutation, AddMutationVariables> = {
  kind: Kind.DOCUMENT,
  definitions: [
    {
      kind: Kind.OPERATION_DEFINITION,
      operation: OperationTypeNode.MUTATION,
      name: {
        kind: Kind.NAME,
        value: 'Add',
      },
      variableDefinitions: [
        {
          kind: Kind.VARIABLE_DEFINITION,
          variable: {
            kind: Kind.VARIABLE,
            name: {
              kind: Kind.NAME,
              value: 'amount',
            },
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
      selectionSet: {
        kind: Kind.SELECTION_SET,
        selections: [
          {
            kind: Kind.FIELD,
            name: {
              kind: Kind.NAME,
              value: 'increment',
            },
            arguments: [
              {
                kind: Kind.ARGUMENT,
                name: {
                  kind: Kind.NAME,
                  value: 'amount',
                },
                value: {
                  kind: Kind.VARIABLE,
                  name: {
                    kind: Kind.NAME,
                    value: 'amount',
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
}
export const WatchDocument: DocumentNode<
  WatchSubscription,
  WatchSubscriptionVariables
> = {
  kind: Kind.DOCUMENT,
  definitions: [
    {
      kind: Kind.OPERATION_DEFINITION,
      operation: OperationTypeNode.SUBSCRIPTION,
      name: {
        kind: Kind.NAME,
        value: 'Watch',
      },
      selectionSet: {
        kind: Kind.SELECTION_SET,
        selections: [
          {
            kind: Kind.FIELD,
            name: {
              kind: Kind.NAME,
              value: 'counterChanged',
            },
            selectionSet: {
              kind: Kind.SELECTION_SET,
              selections: [
                {
                  kind: Kind.FIELD,
                  name: {
                    kind: Kind.NAME,
                    value: 'value',
                  },
                },
                {
                  kind: Kind.FIELD,
                  name: {
                    kind: Kind.NAME,
                    value: 'step',
                  },
                  selectionSet: {
                    kind: Kind.SELECTION_SET,
                    selections: [
                      {
                        kind: Kind.FIELD,
                        name: {
                          kind: Kind.NAME,
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
}
