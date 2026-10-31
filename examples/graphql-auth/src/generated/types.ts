// @generated loutre graphql generateの出力です。直接編集しないでください。
import type { GraphQLResolveInfo } from 'graphql'
import type { User as UserDomain } from '../auth/users.js'
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
export type User = {
  readonly __typename?: 'User'
  readonly id: Scalars['ID']['output']
  readonly name: Scalars['String']['output']
}
export type Query = {
  readonly __typename?: 'Query'
  readonly viewer: User
}
export type Mutation = {
  readonly __typename?: 'Mutation'
  readonly renameViewer: User
}
export type Subscription = {
  readonly __typename?: 'Subscription'
  readonly viewerChanged: User
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
export type ResolverFn<TResult, TParent, TContext, TArgs> = (input: {
  readonly parent: TParent
  readonly args: TArgs
  readonly context: TContext
  readonly info: GraphQLResolveInfo
}) => Promise<TResult> | TResult
export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> =
  (input: {
    readonly parent: TParent
    readonly args: TArgs
    readonly context: TContext
    readonly info: GraphQLResolveInfo
  }) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>
export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (input: {
  readonly parent: TParent
  readonly args: TArgs
  readonly context: TContext
  readonly info: GraphQLResolveInfo
}) => TResult | Promise<TResult>
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
> = (input: {
  readonly parent: TParent
  readonly context: TContext
  readonly info: GraphQLResolveInfo
}) => Maybe<TTypes> | Promise<Maybe<TTypes>>
export type IsTypeOfResolverFn<
  T = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
> = (input: {
  readonly parent: T
  readonly context: TContext
  readonly info: GraphQLResolveInfo
}) => boolean | Promise<boolean>
export type NextResolverFn<T> = () => Promise<T>
export type DirectiveResolverFn<
  TResult = Record<PropertyKey, never>,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> = (input: {
  readonly next: NextResolverFn<TResult>
  readonly parent: TParent
  readonly args: TArgs
  readonly context: TContext
  readonly info: GraphQLResolveInfo
}) => TResult | Promise<TResult>
export type ResolversTypes = {
  User: ResolverTypeWrapper<UserDomain>
  ID: ResolverTypeWrapper<Scalars['ID']['output']>
  String: ResolverTypeWrapper<Scalars['String']['output']>
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>
  Subscription: ResolverTypeWrapper<Record<PropertyKey, never>>
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>
}
export type ResolversParentTypes = {
  User: UserDomain
  ID: Scalars['ID']['output']
  String: Scalars['String']['output']
  Query: Record<PropertyKey, never>
  Mutation: Record<PropertyKey, never>
  Subscription: Record<PropertyKey, never>
  Boolean: Scalars['Boolean']['output']
}
export type UserResolvers<
  ContextType = object,
  ParentType extends ResolversParentTypes['User'] =
    ResolversParentTypes['User'],
> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>
}
export type QueryResolvers<
  ContextType = object,
  ParentType extends ResolversParentTypes['Query'] =
    ResolversParentTypes['Query'],
> = {
  viewer?: Resolver<ResolversTypes['User'], ParentType, ContextType>
}
export type MutationResolvers<
  ContextType = object,
  ParentType extends ResolversParentTypes['Mutation'] =
    ResolversParentTypes['Mutation'],
> = {
  renameViewer?: Resolver<
    ResolversTypes['User'],
    ParentType,
    ContextType,
    RequireFields<MutationrenameViewerArgs, 'name'>
  >
}
export type SubscriptionResolvers<
  ContextType = object,
  ParentType extends ResolversParentTypes['Subscription'] =
    ResolversParentTypes['Subscription'],
> = {
  viewerChanged?: SubscriptionResolver<
    ResolversTypes['User'],
    'viewerChanged',
    ParentType,
    ContextType
  >
}
export type StandardResolvers<ContextType = object> = {
  User?: UserResolvers<ContextType>
  Query?: QueryResolvers<ContextType>
  Mutation?: MutationResolvers<ContextType>
  Subscription?: SubscriptionResolvers<ContextType>
}
export type MutationrenameViewerArgs = {
  readonly name: Scalars['String']['input']
}
export interface CoercedInputTypes {}
import type * as $LoutreData from '@loutrejs/graphql'
export type CoercedArguments<T, K extends keyof T> = Omit<T, K> & {
  readonly [P in K]-?: Exclude<T[P], undefined>
}
export interface SchemaFields<Context extends object> {
  Mutation: {
    renameViewer: $LoutreData.FieldSpec<
      ResolversParentTypes['Mutation'],
      MutationrenameViewerArgs,
      ResolversParentTypes['User'],
      Context
    >
  }
  Query: {
    viewer: $LoutreData.FieldSpec<
      ResolversParentTypes['Query'],
      Record<string, never>,
      ResolversParentTypes['User'],
      Context
    >
  }
  Subscription: {
    viewerChanged: $LoutreData.FieldSpec<
      ResolversParentTypes['Subscription'],
      Record<string, never>,
      ResolversParentTypes['User'],
      Context
    >
  }
  User: {
    id: $LoutreData.FieldSpec<
      ResolversParentTypes['User'],
      Record<string, never>,
      Scalars['ID']['output'],
      Context
    >
    name: $LoutreData.FieldSpec<
      ResolversParentTypes['User'],
      Record<string, never>,
      Scalars['String']['output'],
      Context
    >
  }
}
export type Resolvers<Context extends object = object> =
  $LoutreData.ResolverMap<
    StandardResolvers<Context>,
    Omit<SchemaFields<Context>, 'Subscription'>
  >
