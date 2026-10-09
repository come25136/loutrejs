import type { VariablesOf, ResultOf } from '@graphql-typed-document-node/core'
import type {
  Resolvers,
  ResolversParentTypes,
} from '../../examples/graphql-counter/src/generated/types.js'
import {
  AddDocument,
  SnapshotDocument,
} from '../../examples/graphql-counter/src/client/generated.js'
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

import { createData } from '../../examples/graphql-orders/src/generated/data.js'
import type { Resolvers as OrderResolvers } from '../../examples/graphql-orders/src/generated/types.js'
import type {
  OrderItem,
  Product,
} from '../../examples/graphql-orders/src/domain/commerce.js'
import type { AppContext as OrderContext } from '../../examples/graphql-orders/src/graphql/context.js'
import { graphql } from '@loutrejs/graphql'
import { manifest } from '../../examples/graphql-orders/src/generated/manifest.js'
import { data } from '@loutrejs/graphql/data'

const d = createData()
const mapped = {
  Query: {
    orders: d.Query.orders.source(({ args, context, demand, signal }) => {
      const offset: number = args.pagination.offset
      const limit: number = args.pagination.limit
      const service: OrderContext['commerce'] = context.commerce
      const strategy: 'EAGER' | 'LAZY' | 'HYBRID' = args.strategy
      void offset
      void limit
      void strategy
      return service.search({ ...args, demand, signal })
    }),
  },
  OrderItem: {
    product: d.OrderItem.product.field({
      requires: ['productId', 'revision', 'tenant'],
      read: ({ parent }) =>
        parent.product ? data.loaded(parent.product) : data.missing,
      load: (parents, { context, signal, selection }) => {
        const items: readonly OrderItem[] = parents
        const path: string = selection.fieldName
        void path
        return context.commerce.findProducts(items, signal)
      },
    }),
  },
} satisfies OrderResolvers
void mapped
// @ts-expect-error SchemaにないTypeを拒否する
d.UnknownType
// @ts-expect-error SchemaにないFieldを拒否する
d.OrderItem.unknown
// @ts-expect-error Domainにない内部キーを拒否する
d.OrderItem.product.field({ requires: ['productID'], load: () => [] })
// @ts-expect-error Non-null Fieldのnullを拒否する
d.OrderItem.product.field({ load: () => [null] })
// @ts-expect-error 誤ったload Resultを拒否する
d.OrderItem.product.field({ load: () => ['wrong'] })
// @ts-expect-error 誤ったread Resultを拒否する
d.OrderItem.product.field({ read: () => data.loaded('wrong'), load: () => [] })
// @ts-expect-error Non-null Sourceのnullを拒否する
d.Query.orders.source(() => null)
// @ts-expect-error 誤ったSource Resultを拒否する
d.Query.orders.source(() => ({ totalCount: 'wrong' }))
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
const fromRead = d.OrderItem.product.field({
  read: () => data.loaded(product),
  load: () => [product],
})
void fromRead

import { createData as createConformanceData } from '../../conformance/graphql/generated/data.js'
const c = createConformanceData()
c.Query.at.source(({ args }) => {
  const date: Date = args.value
  return date
})
// @ts-expect-error DateTimeのoutputはDateであり文字列を返せない
c.Query.at.source(() => '2026-01-01')
c.Query.nullableTicks.source(() => null)
c.Query.nullableTicks.source(() => [null])
// @ts-expect-error List Elementの型を維持する
c.Query.nullableTicks.source(() => ['wrong'])
// @ts-expect-error Non-null DateTimeのnullを拒否する
c.Query.at.field({ load: () => [null] })
