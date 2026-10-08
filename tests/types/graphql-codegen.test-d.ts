import type { VariablesOf, ResultOf } from '@graphql-typed-document-node/core'
import type {
  Resolvers,
  ResolversParentTypes,
} from '../../examples/graphql-counter/src/generated/server.js'
import {
  AddDocument,
  SnapshotDocument,
} from '../../examples/graphql-counter/src/generated/client.js'
import type { AppContext } from '../../examples/graphql-counter/src/graphql/context.js'

const counter: ResolversParentTypes['Counter'] = { value: 1, stepId: 'default' }
const value: number = counter.value
const stepId: string = counter.stepId
// @ts-expect-error domainのCounterにはGraphQLのstep objectがない
counter.step
void value
void stepId

const resolvers = {
  Counter: {
    step: (_parent, _args, context) =>
      context.steps
        .findByIds(['default'], context.signal)
        .then((values) => values[0]!),
  },
  Mutation: {
    increment: (_parent, args, context) => {
      const amount: number = args.amount
      return context.counter.increment(amount)
    },
  },
} satisfies Resolvers<AppContext>
void resolvers
const invalid = {
  Query: {
    // @ts-expect-error Counterのdomain型を返す必要がある
    counter: () => ({ value: 'wrong', stepId: 'default' }),
  },
} satisfies Resolvers<AppContext>
void invalid

const variables: VariablesOf<typeof AddDocument> = { amount: 2 }
// @ts-expect-error amountはnumber
const wrongVariables: VariablesOf<typeof AddDocument> = { amount: '2' }
const result: ResultOf<typeof SnapshotDocument> = {
  counter: { value: 1, step: { amount: 1 } },
  activeSubscriptions: 0,
}
// @ts-expect-error 選択していないidをclient結果型へ含めない
result.counter.step.id
// @ts-expect-error domain内部のstepIdをclient結果型へ含めない
result.counter.stepId
void variables
void wrongVariables
