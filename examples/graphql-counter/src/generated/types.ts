// @generated loutre graphql generateの出力です。直接編集しないでください。
// fingerprint: 9998cd77979a3341de177c98c02b25aee37d1e626fd39c88098c24f92b94706b
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
export type Subscription = {
  readonly __typename?: 'Subscription'
  readonly counterChanged: Counter
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
    RequireFields<MutationincrementArgs, 'amount'>
  >
  reset?: Resolver<
    ResolversTypes['Counter'],
    ParentType,
    ContextType,
    RequireFields<MutationresetArgs, 'value'>
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
export type MutationincrementArgs = {
  readonly amount: Scalars['Int']['input']
}
export type MutationresetArgs = {
  readonly value: Scalars['Int']['input']
}
export interface CoercedInputTypes {}
import type { FieldSpec } from '@loutrejs/graphql/data'
import type { AppContext as LoutreContext } from '../graphql/context.js'
export type CoercedArguments<T, K extends keyof T> = Omit<T, K> & {
  readonly [P in K]-?: Exclude<T[P], undefined>
}
export type SchemaContext = LoutreContext
export interface SchemaFields {
  Counter: {
    step: FieldSpec<
      ResolversParentTypes['Counter'],
      Record<string, never>,
      ResolversParentTypes['Step'],
      LoutreContext
    >
    value: FieldSpec<
      ResolversParentTypes['Counter'],
      Record<string, never>,
      Scalars['Int']['output'],
      LoutreContext
    >
  }
  Mutation: {
    increment: FieldSpec<
      ResolversParentTypes['Mutation'],
      MutationincrementArgs,
      ResolversParentTypes['Counter'],
      LoutreContext
    >
    reset: FieldSpec<
      ResolversParentTypes['Mutation'],
      MutationresetArgs,
      ResolversParentTypes['Counter'],
      LoutreContext
    >
  }
  Query: {
    activeSubscriptions: FieldSpec<
      ResolversParentTypes['Query'],
      Record<string, never>,
      Scalars['Int']['output'],
      LoutreContext
    >
    counter: FieldSpec<
      ResolversParentTypes['Query'],
      Record<string, never>,
      ResolversParentTypes['Counter'],
      LoutreContext
    >
    stepBatchCount: FieldSpec<
      ResolversParentTypes['Query'],
      Record<string, never>,
      Scalars['Int']['output'],
      LoutreContext
    >
  }
  Step: {
    amount: FieldSpec<
      ResolversParentTypes['Step'],
      Record<string, never>,
      Scalars['Int']['output'],
      LoutreContext
    >
    id: FieldSpec<
      ResolversParentTypes['Step'],
      Record<string, never>,
      Scalars['ID']['output'],
      LoutreContext
    >
  }
  Subscription: {
    counterChanged: FieldSpec<
      ResolversParentTypes['Subscription'],
      Record<string, never>,
      ResolversParentTypes['Counter'],
      LoutreContext
    >
  }
}
