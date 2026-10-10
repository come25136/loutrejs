import { graphql } from '@loutrejs/graphql'
import type { GraphQLResolveInfo } from 'graphql'
import { bindManifest } from '../../examples/graphql-counter/src/generated/bindings.js'
import { schemaDocument } from '../../examples/graphql-counter/src/generated/schema-ast.js'
import type { AppContext } from '../../examples/graphql-counter/src/graphql/context.js'
import type { Counter } from '../../examples/graphql-counter/src/domain/counter.js'
import { bindManifest as bindOrders } from '../../examples/graphql-orders/src/generated/bindings.js'
import { schemaDocument as ordersDocument } from '../../examples/graphql-orders/src/generated/schema-ast.js'
import type { AppContext as OrderContext } from '../../examples/graphql-orders/src/graphql/context.js'
import { bindManifest as bindConformance } from '../../conformance/graphql/generated/bindings.js'
import { schemaDocument as conformanceDocument } from '../../conformance/graphql/generated/schema-ast.js'

const explicit = bindManifest<AppContext>({
  schemaDocument,
  resolvers: {
    Query: {},
    Counter: {
      step(parent, args, context, info) {
        const domain: Counter = parent
        const signal: AbortSignal = context.signal
        const field: GraphQLResolveInfo = info
        // @ts-expect-error domainの内部キーはstring
        const invalidKey: number = parent.stepId
        const emptyArgs: Record<PropertyKey, never> = args
        const argsAreAny: 0 extends 1 & typeof args ? true : false = false
        void emptyArgs
        void argsAreAny
        void invalidKey
        void field
        return context.steps
          .findByIds([domain.stepId], signal)
          .then((values) => values[0]!)
      },
    },
    Mutation: {
      increment(_parent, args, context) {
        const amount: number = args.amount
        const store: AppContext['counter'] = context.counter
        // @ts-expect-error coerced amountはnumber
        const invalidAmount: string = args.amount
        // @ts-expect-error Contextに存在しないpropertyを拒否する
        context.absent
        void invalidAmount
        return store.increment(amount)
      },
    },
    Subscription: {
      counterChanged: {
        subscribe: (_parent, _args, context) =>
          context.counter.watch(context.signal),
        resolve: (event: { counterChanged: Counter }) => event.counterChanged,
      },
    },
  },
})

const inferred = bindManifest({
  schemaDocument,
  resolvers: {
    Query: {
      counter: (_parent, _args, context) => {
        const applicationIndependent: object = context
        // @ts-expect-error SDLはApplicationのContextを持たない
        context.counter
        void applicationIndependent
        return { value: 0, stepId: 'default' }
      },
    },
  },
})
void inferred

bindManifest<AppContext>({
  schemaDocument,
  resolvers: {
    Query: {
      // @ts-expect-error 存在しないFieldを拒否する
      absent: () => 1,
    },
  },
})
bindManifest<AppContext>({
  schemaDocument,
  resolvers: {
    // @ts-expect-error 存在しないTypeを拒否する
    Absent: {},
  },
})
bindManifest<AppContext>({
  schemaDocument,
  resolvers: {
    Query: {
      // @ts-expect-error domainのCounter.valueはnumber
      counter: () => ({ value: 'wrong', stepId: 'default' }),
    },
  },
})
bindManifest<AppContext>({
  schemaDocument,
  resolvers: {
    Query: {
      // @ts-expect-error Non-null Fieldへnullを返せない
      counter: () => null,
    },
  },
})

const custom = bindManifest<{ readonly label: string }>({
  schemaDocument,
  resolvers: {
    Query: {
      counter: (_parent, _args, context) => {
        const label: string = context.label
        // @ts-expect-error 指定したContextへ切り替わる
        context.counter
        return { value: label.length, stepId: label }
      },
    },
  },
})
graphql.endpoint({
  name: 'Custom',
  path: '/graphql',
  manifest: custom,
  factory: () => ({ context: () => ({ label: 'custom' }) }),
})
graphql.endpoint({
  name: 'MissingCustomContext',
  path: '/graphql',
  manifest: custom,
  // @ts-expect-error bindManifestのContextをendpointへ引き継ぐ
  factory: () => ({ context: () => ({}) }),
})
graphql.endpoint({
  name: 'MissingContext',
  path: '/graphql',
  manifest: explicit,
  // @ts-expect-error 明示したAppContextをendpointへ引き継ぐ
  factory: () => ({ context: () => ({}) }),
})

bindOrders<OrderContext>({
  schemaDocument: ordersDocument,
  resolvers: {
    Query: {
      orders(_parent, args, context) {
        const offset: number = args.pagination.offset
        const strategy: 'EAGER' | 'LAZY' | 'HYBRID' = args.strategy
        // @ts-expect-error nested defaultはundefinedを含まないnumber
        const invalidOffset: undefined = args.pagination.offset
        void offset
        void strategy
        void invalidOffset
        return context.commerce.search({
          ...args,
          signal: context.signal,
          demand: {
            parentType: 'Query',
            fieldName: 'orders',
            responseKeys: ['orders'],
            args,
            requires: [],
            prefetchable: false,
            children: [],
          },
        })
      },
    },
  },
})
bindConformance<object>({
  schemaDocument: conformanceDocument,
  resolvers: {
    Query: {
      at(_parent, args) {
        const value: Date = args.value
        // @ts-expect-error coerced ScalarはDate
        const invalidValue: string = args.value
        void invalidValue
        return value
      },
      nullableTicks: () => [null],
    },
  },
})
