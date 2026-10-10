import type { VariablesOf, ResultOf } from '@graphql-typed-document-node/core'
import type {
  Resolvers,
  ResolversParentTypes,
} from '../../examples/graphql-counter/src/generated/types.js'
import {
  AddDocument,
  SnapshotDocument,
} from '../../conformance/graphql/client/counter.js'
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

import type { Resolvers as OrderResolvers } from '../../examples/graphql-orders/src/generated/types.js'
import type {
  OrderItem,
  Product,
} from '../../examples/graphql-orders/src/domain/commerce.js'
import type { AppContext as OrderContext } from '../../examples/graphql-orders/src/graphql/context.js'
import { graphql } from '@loutrejs/graphql'
import { manifest } from '../../examples/graphql-orders/src/graphql/manifest.js'
import { data, getFieldSelection } from '@loutrejs/graphql/data'

const alternate = {
  Query: {
    productBatchCount: (_parent, _args, context) => {
      const label: string = context.label
      // @ts-expect-error 同じSchemaでもApplicationごとにContextを選べる
      context.commerce
      return label.length
    },
  },
} satisfies OrderResolvers<{ readonly label: string }>
void alternate
const mapped = {
  Query: {
    orders: {
      resolve: (_parent, args, context, info) => {
        const offset: number = args.pagination.offset
        const limit: number = args.pagination.limit
        const service: OrderContext['commerce'] = context.commerce
        const strategy: 'EAGER' | 'LAZY' | 'HYBRID' = args.strategy
        void offset
        void limit
        void strategy
        return service.search({
          ...args,
          selection: getFieldSelection(info),
          signal: context.signal,
        })
      },
    },
  },
  OrderItem: {
    product: {
      requires: ['productId', 'revision', 'tenant'],
      read: ({ parent }) =>
        parent.product ? data.loaded(parent.product) : data.missing,
      load: (parents, { context, signal, selection }) => {
        const items: readonly OrderItem[] = parents
        const path: string = selection.fieldName
        void path
        return context.commerce.findProducts(items, signal)
      },
    },
  },
} satisfies OrderResolvers<OrderContext>
void mapped
// @ts-expect-error SchemaにないTypeを拒否する
const unknownType = { UnknownType: {} } satisfies OrderResolvers<OrderContext>
const unknownField = {
  // @ts-expect-error SchemaにないFieldを拒否する
  OrderItem: { unknown: () => 1 },
} satisfies OrderResolvers<OrderContext>
void unknownType
void unknownField

type ProductResolver = NonNullable<
  OrderResolvers<OrderContext>['OrderItem']
>['product']
const invalidKey = {
  // @ts-expect-error Domainにない内部キーを拒否する
  requires: ['productID'],
  load: () => [],
} satisfies ProductResolver
// @ts-expect-error Non-null Fieldのnullを拒否する
const invalidNull = { load: () => [null] } satisfies ProductResolver
// @ts-expect-error 誤ったload Resultを拒否する
const invalidLoad = { load: () => ['wrong'] } satisfies ProductResolver
const invalidRead = {
  // @ts-expect-error 誤ったread Resultを拒否する
  read: () => data.loaded('wrong'),
  load: () => [],
} satisfies ProductResolver
const ambiguous: ProductResolver = {
  load: () => [],
  // @ts-expect-error loadとresolveの併用を拒否する
  resolve: () => ({ id: '1', name: 'n', category: { id: 'c', name: 'c' } }),
}
const invalidAuthorization: ProductResolver = {
  resolve: () => ({ id: '1', name: 'n', category: { id: 'c', name: 'c' } }),
  // @ts-expect-error authorizeだけをresolveへ指定して認可を黙って無視しない
  authorize: () => {},
}
const invalidRoot = {
  // @ts-expect-error Non-null resolveのnullを拒否する
  Query: { orders: () => null },
} satisfies OrderResolvers<OrderContext>
const invalidResult = {
  // @ts-expect-error 誤ったresolve Resultを拒否する
  Query: { orders: { resolve: () => ({ totalCount: 'wrong' }) } },
} satisfies OrderResolvers<OrderContext>
void invalidKey
void invalidNull
void invalidLoad
void invalidRead
void ambiguous
void invalidAuthorization
void invalidRoot
void invalidResult
// @ts-expect-error loaded(undefined)を拒否する
data.loaded(undefined)
graphql.endpoint({
  name: 'InvalidContext',
  path: '/graphql',
  manifest,
  // @ts-expect-error Manifestが要求するContextを返す必要がある
  factory: () => ({ context: () => ({}) }),
})
const product: Product = {
  id: '1',
  name: 'n',
  category: { id: 'c', name: 'c' },
}
const fromRead = {
  read: () => data.loaded(product),
  load: () => [product],
} satisfies ProductResolver
void fromRead

import type { Resolvers as ConformanceResolvers } from '../../conformance/graphql/generated/types.js'
type AtResolver = NonNullable<ConformanceResolvers['Query']>['at']
const at = {
  resolve: (_parent, args) => {
    const date: Date = args.value
    return date
  },
} satisfies AtResolver
// @ts-expect-error DateTimeのoutputはDateであり文字列を返せない
const invalidDate = { resolve: () => '2026-01-01' } satisfies AtResolver
const nullable = {
  Query: { nullableTicks: () => null },
} satisfies ConformanceResolvers
const nullableElements = {
  Query: { nullableTicks: () => [null] },
} satisfies ConformanceResolvers
const invalidElements = {
  // @ts-expect-error List Elementの型を維持する
  Query: { nullableTicks: () => ['wrong'] },
} satisfies ConformanceResolvers
// @ts-expect-error Non-null DateTimeのnullを拒否する
const invalidDateLoad = { load: () => [null] } satisfies AtResolver
void at
void invalidDate
void nullable
void nullableElements
void invalidElements
void invalidDateLoad
