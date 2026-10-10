// @generated loutre graphql generateの出力です。直接編集しないでください。
import type {
  GraphQLResolveInfo,
  GraphQLScalarType,
  GraphQLScalarTypeConfig,
} from 'graphql'
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
  DateTime: {
    input: Date
    output: Date
  }
}
export type Query = {
  readonly __typename?: 'Query'
  readonly hello: Scalars['String']['output']
  readonly cleanupCount: Scalars['Int']['output']
  readonly at: Scalars['DateTime']['output']
  readonly nullableTicks?: Maybe<ReadonlyArray<Maybe<Tick>>>
}
export type Mutation = {
  readonly __typename?: 'Mutation'
  readonly update: Scalars['String']['output']
}
export type Tick = {
  readonly __typename?: 'Tick'
  readonly sequence: Scalars['Int']['output']
  readonly hidden: Scalars['String']['output']
}
export type Subscription = {
  readonly __typename?: 'Subscription'
  readonly ticks: Tick
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
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>
  String: ResolverTypeWrapper<Scalars['String']['output']>
  Int: ResolverTypeWrapper<Scalars['Int']['output']>
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>
  Tick: ResolverTypeWrapper<Tick>
  Subscription: ResolverTypeWrapper<Record<PropertyKey, never>>
  DateTime: ResolverTypeWrapper<Scalars['DateTime']['output']>
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>
}
export type ResolversParentTypes = {
  Query: Record<PropertyKey, never>
  String: Scalars['String']['output']
  Int: Scalars['Int']['output']
  Mutation: Record<PropertyKey, never>
  Tick: Tick
  Subscription: Record<PropertyKey, never>
  DateTime: Scalars['DateTime']['output']
  Boolean: Scalars['Boolean']['output']
}
export type QueryResolvers<
  ContextType = object,
  ParentType extends ResolversParentTypes['Query'] =
    ResolversParentTypes['Query'],
> = {
  hello?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  cleanupCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  at?: Resolver<
    ResolversTypes['DateTime'],
    ParentType,
    ContextType,
    RequireFields<QueryatArgs, 'value'>
  >
  nullableTicks?: Resolver<
    Maybe<ReadonlyArray<Maybe<ResolversTypes['Tick']>>>,
    ParentType,
    ContextType
  >
}
export type MutationResolvers<
  ContextType = object,
  ParentType extends ResolversParentTypes['Mutation'] =
    ResolversParentTypes['Mutation'],
> = {
  update?: Resolver<
    ResolversTypes['String'],
    ParentType,
    ContextType,
    RequireFields<MutationupdateArgs, 'value'>
  >
}
export type TickResolvers<
  ContextType = object,
  ParentType extends ResolversParentTypes['Tick'] =
    ResolversParentTypes['Tick'],
> = {
  sequence?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  hidden?: Resolver<ResolversTypes['String'], ParentType, ContextType>
}
export type SubscriptionResolvers<
  ContextType = object,
  ParentType extends ResolversParentTypes['Subscription'] =
    ResolversParentTypes['Subscription'],
> = {
  ticks?: SubscriptionResolver<
    ResolversTypes['Tick'],
    'ticks',
    ParentType,
    ContextType
  >
}
export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<
  ResolversTypes['DateTime'],
  any
> {
  name: 'DateTime'
}
export type Resolvers<ContextType = object> = {
  Query?: QueryResolvers<ContextType>
  Mutation?: MutationResolvers<ContextType>
  Tick?: TickResolvers<ContextType>
  Subscription?: SubscriptionResolvers<ContextType>
  DateTime?: GraphQLScalarType
}
export type MutationupdateArgs = {
  readonly value: Scalars['String']['input']
}
export type QueryatArgs = {
  readonly value: Scalars['DateTime']['input']
}
export interface CoercedInputTypes {}
import type { FieldSpec } from '@loutrejs/graphql/data'
export type CoercedArguments<T, K extends keyof T> = Omit<T, K> & {
  readonly [P in K]-?: Exclude<T[P], undefined>
}
export interface SchemaFields<Context extends object> {
  Mutation: {
    update: FieldSpec<
      ResolversParentTypes['Mutation'],
      MutationupdateArgs,
      Scalars['String']['output'],
      Context
    >
  }
  Query: {
    at: FieldSpec<
      ResolversParentTypes['Query'],
      QueryatArgs,
      Scalars['DateTime']['output'],
      Context
    >
    cleanupCount: FieldSpec<
      ResolversParentTypes['Query'],
      Record<string, never>,
      Scalars['Int']['output'],
      Context
    >
    hello: FieldSpec<
      ResolversParentTypes['Query'],
      Record<string, never>,
      Scalars['String']['output'],
      Context
    >
    nullableTicks: FieldSpec<
      ResolversParentTypes['Query'],
      Record<string, never>,
      Maybe<ReadonlyArray<Maybe<ResolversParentTypes['Tick']>>>,
      Context
    >
  }
  Subscription: {
    ticks: FieldSpec<
      ResolversParentTypes['Subscription'],
      Record<string, never>,
      ResolversParentTypes['Tick'],
      Context
    >
  }
  Tick: {
    hidden: FieldSpec<
      ResolversParentTypes['Tick'],
      Record<string, never>,
      Scalars['String']['output'],
      Context
    >
    sequence: FieldSpec<
      ResolversParentTypes['Tick'],
      Record<string, never>,
      Scalars['Int']['output'],
      Context
    >
  }
}
