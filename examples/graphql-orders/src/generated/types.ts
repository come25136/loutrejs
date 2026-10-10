// @generated loutre graphql generateの出力です。直接編集しないでください。
import type { GraphQLResolveInfo } from 'graphql'
import type {
  OrderConnection as OrderConnectionDomain,
  Order as OrderDomain,
  OrderItem as OrderItemDomain,
  Customer as CustomerDomain,
  Account as AccountDomain,
  Product as ProductDomain,
  Category as CategoryDomain,
} from '../domain/commerce.js'
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
export type Strategy = 'EAGER' | 'LAZY' | 'HYBRID'
export type OrderFilter = {
  readonly customerId?: InputMaybe<Scalars['ID']['input']>
}
export type PaginationInput = {
  readonly offset?: Scalars['Int']['input']
  readonly limit?: Scalars['Int']['input']
}
export type PageInfo = {
  readonly __typename?: 'PageInfo'
  readonly hasPreviousPage: Scalars['Boolean']['output']
  readonly hasNextPage: Scalars['Boolean']['output']
}
export type OrderConnection = {
  readonly __typename?: 'OrderConnection'
  readonly totalCount: Scalars['Int']['output']
  readonly pageInfo: PageInfo
  readonly edges: ReadonlyArray<Order>
}
export type Order = {
  readonly __typename?: 'Order'
  readonly id: Scalars['ID']['output']
  readonly customer: Customer
  readonly items: ReadonlyArray<OrderItem>
}
export type Customer = {
  readonly __typename?: 'Customer'
  readonly id: Scalars['ID']['output']
  readonly account: Account
}
export type Account = {
  readonly __typename?: 'Account'
  readonly id: Scalars['ID']['output']
  readonly name: Scalars['String']['output']
}
export type OrderItem = {
  readonly __typename?: 'OrderItem'
  readonly id: Scalars['ID']['output']
  readonly quantity: Scalars['Int']['output']
  readonly product: Product
}
export type Product = {
  readonly __typename?: 'Product'
  readonly id: Scalars['ID']['output']
  readonly name: Scalars['String']['output']
  readonly category: Category
}
export type Category = {
  readonly __typename?: 'Category'
  readonly id: Scalars['ID']['output']
  readonly name: Scalars['String']['output']
}
export type Query = {
  readonly __typename?: 'Query'
  readonly orders: OrderConnection
  readonly productBatchCount: Scalars['Int']['output']
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
  Strategy: Strategy
  OrderFilter: OrderFilter
  ID: ResolverTypeWrapper<Scalars['ID']['output']>
  PaginationInput: PaginationInput
  Int: ResolverTypeWrapper<Scalars['Int']['output']>
  PageInfo: ResolverTypeWrapper<PageInfo>
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>
  OrderConnection: ResolverTypeWrapper<OrderConnectionDomain>
  Order: ResolverTypeWrapper<OrderDomain>
  Customer: ResolverTypeWrapper<CustomerDomain>
  Account: ResolverTypeWrapper<AccountDomain>
  String: ResolverTypeWrapper<Scalars['String']['output']>
  OrderItem: ResolverTypeWrapper<OrderItemDomain>
  Product: ResolverTypeWrapper<ProductDomain>
  Category: ResolverTypeWrapper<CategoryDomain>
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>
}
export type ResolversParentTypes = {
  OrderFilter: OrderFilter
  ID: Scalars['ID']['output']
  PaginationInput: PaginationInput
  Int: Scalars['Int']['output']
  PageInfo: PageInfo
  Boolean: Scalars['Boolean']['output']
  OrderConnection: OrderConnectionDomain
  Order: OrderDomain
  Customer: CustomerDomain
  Account: AccountDomain
  String: Scalars['String']['output']
  OrderItem: OrderItemDomain
  Product: ProductDomain
  Category: CategoryDomain
  Query: Record<PropertyKey, never>
}
export type PageInfoResolvers<
  ContextType = object,
  ParentType extends ResolversParentTypes['PageInfo'] =
    ResolversParentTypes['PageInfo'],
> = {
  hasPreviousPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  hasNextPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
}
export type OrderConnectionResolvers<
  ContextType = object,
  ParentType extends ResolversParentTypes['OrderConnection'] =
    ResolversParentTypes['OrderConnection'],
> = {
  totalCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>
  edges?: Resolver<
    ReadonlyArray<ResolversTypes['Order']>,
    ParentType,
    ContextType
  >
}
export type OrderResolvers<
  ContextType = object,
  ParentType extends ResolversParentTypes['Order'] =
    ResolversParentTypes['Order'],
> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  customer?: Resolver<ResolversTypes['Customer'], ParentType, ContextType>
  items?: Resolver<
    ReadonlyArray<ResolversTypes['OrderItem']>,
    ParentType,
    ContextType
  >
}
export type CustomerResolvers<
  ContextType = object,
  ParentType extends ResolversParentTypes['Customer'] =
    ResolversParentTypes['Customer'],
> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  account?: Resolver<ResolversTypes['Account'], ParentType, ContextType>
}
export type AccountResolvers<
  ContextType = object,
  ParentType extends ResolversParentTypes['Account'] =
    ResolversParentTypes['Account'],
> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>
}
export type OrderItemResolvers<
  ContextType = object,
  ParentType extends ResolversParentTypes['OrderItem'] =
    ResolversParentTypes['OrderItem'],
> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  quantity?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  product?: Resolver<ResolversTypes['Product'], ParentType, ContextType>
}
export type ProductResolvers<
  ContextType = object,
  ParentType extends ResolversParentTypes['Product'] =
    ResolversParentTypes['Product'],
> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  category?: Resolver<ResolversTypes['Category'], ParentType, ContextType>
}
export type CategoryResolvers<
  ContextType = object,
  ParentType extends ResolversParentTypes['Category'] =
    ResolversParentTypes['Category'],
> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>
}
export type QueryResolvers<
  ContextType = object,
  ParentType extends ResolversParentTypes['Query'] =
    ResolversParentTypes['Query'],
> = {
  orders?: Resolver<
    ResolversTypes['OrderConnection'],
    ParentType,
    ContextType,
    RequireFields<QueryordersArgs, 'filter' | 'pagination' | 'strategy'>
  >
  productBatchCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
}
export type StandardResolvers<ContextType = object> = {
  PageInfo?: PageInfoResolvers<ContextType>
  OrderConnection?: OrderConnectionResolvers<ContextType>
  Order?: OrderResolvers<ContextType>
  Customer?: CustomerResolvers<ContextType>
  Account?: AccountResolvers<ContextType>
  OrderItem?: OrderItemResolvers<ContextType>
  Product?: ProductResolvers<ContextType>
  Category?: CategoryResolvers<ContextType>
  Query?: QueryResolvers<ContextType>
}
export type QueryordersArgs = {
  readonly filter: CoercedInputTypes['OrderFilter']
  readonly pagination: CoercedInputTypes['PaginationInput']
  readonly strategy: Strategy
}
export interface CoercedInputTypes {
  OrderFilter: {
    readonly customerId?: InputMaybe<Scalars['ID']['input']>
  }
  PaginationInput: {
    readonly offset: Scalars['Int']['input']
    readonly limit: Scalars['Int']['input']
  }
}
import type { FieldSpec, ResolverMap } from '@loutrejs/graphql/data'
export type CoercedArguments<T, K extends keyof T> = Omit<T, K> & {
  readonly [P in K]-?: Exclude<T[P], undefined>
}
export interface SchemaFields<Context extends object> {
  Account: {
    id: FieldSpec<
      ResolversParentTypes['Account'],
      Record<string, never>,
      Scalars['ID']['output'],
      Context
    >
    name: FieldSpec<
      ResolversParentTypes['Account'],
      Record<string, never>,
      Scalars['String']['output'],
      Context
    >
  }
  Category: {
    id: FieldSpec<
      ResolversParentTypes['Category'],
      Record<string, never>,
      Scalars['ID']['output'],
      Context
    >
    name: FieldSpec<
      ResolversParentTypes['Category'],
      Record<string, never>,
      Scalars['String']['output'],
      Context
    >
  }
  Customer: {
    account: FieldSpec<
      ResolversParentTypes['Customer'],
      Record<string, never>,
      ResolversParentTypes['Account'],
      Context
    >
    id: FieldSpec<
      ResolversParentTypes['Customer'],
      Record<string, never>,
      Scalars['ID']['output'],
      Context
    >
  }
  Order: {
    customer: FieldSpec<
      ResolversParentTypes['Order'],
      Record<string, never>,
      ResolversParentTypes['Customer'],
      Context
    >
    id: FieldSpec<
      ResolversParentTypes['Order'],
      Record<string, never>,
      Scalars['ID']['output'],
      Context
    >
    items: FieldSpec<
      ResolversParentTypes['Order'],
      Record<string, never>,
      ReadonlyArray<ResolversParentTypes['OrderItem']>,
      Context
    >
  }
  OrderConnection: {
    edges: FieldSpec<
      ResolversParentTypes['OrderConnection'],
      Record<string, never>,
      ReadonlyArray<ResolversParentTypes['Order']>,
      Context
    >
    pageInfo: FieldSpec<
      ResolversParentTypes['OrderConnection'],
      Record<string, never>,
      ResolversParentTypes['PageInfo'],
      Context
    >
    totalCount: FieldSpec<
      ResolversParentTypes['OrderConnection'],
      Record<string, never>,
      Scalars['Int']['output'],
      Context
    >
  }
  OrderItem: {
    id: FieldSpec<
      ResolversParentTypes['OrderItem'],
      Record<string, never>,
      Scalars['ID']['output'],
      Context
    >
    product: FieldSpec<
      ResolversParentTypes['OrderItem'],
      Record<string, never>,
      ResolversParentTypes['Product'],
      Context
    >
    quantity: FieldSpec<
      ResolversParentTypes['OrderItem'],
      Record<string, never>,
      Scalars['Int']['output'],
      Context
    >
  }
  PageInfo: {
    hasNextPage: FieldSpec<
      ResolversParentTypes['PageInfo'],
      Record<string, never>,
      Scalars['Boolean']['output'],
      Context
    >
    hasPreviousPage: FieldSpec<
      ResolversParentTypes['PageInfo'],
      Record<string, never>,
      Scalars['Boolean']['output'],
      Context
    >
  }
  Product: {
    category: FieldSpec<
      ResolversParentTypes['Product'],
      Record<string, never>,
      ResolversParentTypes['Category'],
      Context
    >
    id: FieldSpec<
      ResolversParentTypes['Product'],
      Record<string, never>,
      Scalars['ID']['output'],
      Context
    >
    name: FieldSpec<
      ResolversParentTypes['Product'],
      Record<string, never>,
      Scalars['String']['output'],
      Context
    >
  }
  Query: {
    orders: FieldSpec<
      ResolversParentTypes['Query'],
      QueryordersArgs,
      ResolversParentTypes['OrderConnection'],
      Context
    >
    productBatchCount: FieldSpec<
      ResolversParentTypes['Query'],
      Record<string, never>,
      Scalars['Int']['output'],
      Context
    >
  }
}
export type Resolvers<Context extends object = object> = ResolverMap<
  StandardResolvers<Context>,
  SchemaFields<Context>
>
