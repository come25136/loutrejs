// このファイルはloutre graphql generateが生成します。直接編集しないでください。
import type { GraphQLResolveInfo } from 'graphql'
import type { Counter as CounterDomain } from '../domain/counter.js'
import type { Step as StepDomain } from '../domain/step.js'
import type { AppContext } from '../graphql/context.js'
export type Maybe<T> = T | null
export type InputMaybe<T> = Maybe<T>
export type RequireFields<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: NonNullable<T[P]>
}
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
export type ResolverTypeWrapper<T> = Promise<T> | T
export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>
}
export type Resolver<
  TResult,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> =
  | ResolverFn<TResult, TParent, TContext, TArgs>
  | ResolverWithResolve<TResult, TParent, TContext, TArgs>
export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => Promise<TResult> | TResult
export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>
export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => TResult | Promise<TResult>
export interface SubscriptionSubscriberObject<
  TResult,
  TKey extends string,
  TParent,
  TContext,
  TArgs,
> {
  subscribe: SubscriptionSubscribeFn<
    {
      [key in TKey]: TResult
    },
    TParent,
    TContext,
    TArgs
  >
  resolve?: SubscriptionResolveFn<
    TResult,
    {
      [key in TKey]: TResult
    },
    TContext,
    TArgs
  >
}
export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>
}
export type SubscriptionObject<
  TResult,
  TKey extends string,
  TParent,
  TContext,
  TArgs,
> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>
export type SubscriptionResolver<
  TResult,
  TKey extends string,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> =
  | ((
      ...args: any[]
    ) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>
export type TypeResolveFn<
  TTypes,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo,
) => Maybe<TTypes> | Promise<Maybe<TTypes>>
export type IsTypeOfResolverFn<
  T = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
> = (
  obj: T,
  context: TContext,
  info: GraphQLResolveInfo,
) => boolean | Promise<boolean>
export type NextResolverFn<T> = () => Promise<T>
export type DirectiveResolverFn<
  TResult = Record<PropertyKey, never>,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => TResult | Promise<TResult>
export type ResolversTypes = {
  Counter: ResolverTypeWrapper<CounterDomain>
  Int: ResolverTypeWrapper<Scalars['Int']['output']>
  Step: ResolverTypeWrapper<StepDomain>
  ID: ResolverTypeWrapper<Scalars['ID']['output']>
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>
  Subscription: ResolverTypeWrapper<Record<PropertyKey, never>>
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>
  String: ResolverTypeWrapper<Scalars['String']['output']>
}
export type ResolversParentTypes = {
  Counter: CounterDomain
  Int: Scalars['Int']['output']
  Step: StepDomain
  ID: Scalars['ID']['output']
  Query: Record<PropertyKey, never>
  Mutation: Record<PropertyKey, never>
  Subscription: Record<PropertyKey, never>
  Boolean: Scalars['Boolean']['output']
  String: Scalars['String']['output']
}
export type CounterResolvers<
  ContextType = AppContext,
  ParentType extends ResolversParentTypes['Counter'] =
    ResolversParentTypes['Counter'],
> = {
  value?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  step?: Resolver<ResolversTypes['Step'], ParentType, ContextType>
}
export type StepResolvers<
  ContextType = AppContext,
  ParentType extends ResolversParentTypes['Step'] =
    ResolversParentTypes['Step'],
> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  amount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
}
export type QueryResolvers<
  ContextType = AppContext,
  ParentType extends ResolversParentTypes['Query'] =
    ResolversParentTypes['Query'],
> = {
  counter?: Resolver<ResolversTypes['Counter'], ParentType, ContextType>
  activeSubscriptions?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  stepBatchCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
}
export type MutationResolvers<
  ContextType = AppContext,
  ParentType extends ResolversParentTypes['Mutation'] =
    ResolversParentTypes['Mutation'],
> = {
  increment?: Resolver<
    ResolversTypes['Counter'],
    ParentType,
    ContextType,
    RequireFields<MutationIncrementArgs, 'amount'>
  >
  reset?: Resolver<
    ResolversTypes['Counter'],
    ParentType,
    ContextType,
    RequireFields<MutationResetArgs, 'value'>
  >
}
export type SubscriptionResolvers<
  ContextType = AppContext,
  ParentType extends ResolversParentTypes['Subscription'] =
    ResolversParentTypes['Subscription'],
> = {
  counterChanged?: SubscriptionResolver<
    ResolversTypes['Counter'],
    'counterChanged',
    ParentType,
    ContextType
  >
}
export type Resolvers<ContextType = AppContext> = {
  Counter?: CounterResolvers<ContextType>
  Step?: StepResolvers<ContextType>
  Query?: QueryResolvers<ContextType>
  Mutation?: MutationResolvers<ContextType>
  Subscription?: SubscriptionResolvers<ContextType>
}
export const typeDefs =
  'type Counter {\n  value: Int!\n  step: Step!\n}\n\ntype Step {\n  id: ID!\n  amount: Int!\n}\n\ntype Query {\n  counter: Counter!\n  activeSubscriptions: Int!\n  stepBatchCount: Int!\n}\n\ntype Mutation {\n  increment(amount: Int! = 1): Counter!\n  reset(value: Int! = 0): Counter!\n}\n\ntype Subscription {\n  counterChanged: Counter!\n}'
