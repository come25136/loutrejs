import type { ArgsClass } from './args.js'
import type { EnvClass } from './env.js'
import type { RuntimeInputKey } from './runtime-input.js'
import type { Class, TokenLike, TokenValue } from './token.js'

export type Scope = 'application' | 'transient'

interface ProviderBase<TToken extends TokenLike> {
  readonly provide: TToken
  readonly scope: Scope
}

export interface ClassProvider<
  TToken extends TokenLike = TokenLike,
  TValue = TokenValue<TToken>,
> extends ProviderBase<TToken> {
  readonly kind: 'class'
  readonly useClass: Class<TValue>
}

export interface ValueProvider<
  TToken extends TokenLike = TokenLike,
> extends ProviderBase<TToken> {
  readonly kind: 'value'
  readonly useValue: TokenValue<TToken>
}

export interface FactoryProvider<
  TToken extends TokenLike = TokenLike,
> extends ProviderBase<TToken> {
  readonly kind: 'factory'
  readonly inject: readonly TokenLike[]
  readonly useFactory: (...dependencies: any[]) => TokenValue<TToken>
}

export interface ConditionalProvider<
  TToken extends TokenLike = TokenLike,
> extends ProviderBase<TToken> {
  readonly kind: 'conditional'
  readonly select: RuntimeInputKey<PropertyKey>
  readonly mapping: Readonly<Record<PropertyKey, Class<TokenValue<TToken>>>>
}

export interface EnvironmentProvider extends ProviderBase<EnvClass> {
  readonly kind: 'environment'
  readonly provide: EnvClass
  readonly scope: 'application'
}

export interface ArgumentsProvider extends ProviderBase<ArgsClass> {
  readonly kind: 'arguments'
  readonly provide: ArgsClass
  readonly scope: 'application'
}

export type ProviderDescriptor =
  | ClassProvider
  | ValueProvider
  | FactoryProvider
  | ConditionalProvider
  | EnvironmentProvider
  | ArgumentsProvider

export interface SelfClassProvider<
  TToken extends Class = Class,
> extends ProviderBase<TToken> {
  readonly kind: 'self-class'
}

export type ProviderDeclaration = Class | SelfClassProvider | ProviderDescriptor

export interface ProviderScopeOptions {
  readonly scope?: Scope
}

export interface FactoryDefinition<T> {
  readonly inject?: readonly TokenLike[]
  readonly use: (...dependencies: any[]) => T
}

export interface ProviderBuilder<
  TToken extends TokenLike,
> extends ProviderBase<TToken> {
  useClass(implementation: Class<TokenValue<TToken>>): ClassProvider<TToken>
  useValue(value: TokenValue<TToken>): ValueProvider<TToken>
  useFactory(
    definition: FactoryDefinition<TokenValue<TToken>>,
  ): FactoryProvider<TToken>
  select<TKey extends PropertyKey>(
    key: RuntimeInputKey<TKey>,
    mapping: Readonly<Record<TKey, Class<TokenValue<TToken>>>>,
  ): ConditionalProvider<TToken>
}

export function provide<TToken extends Class>(
  token: TToken,
  options?: ProviderScopeOptions,
): SelfClassProvider<TToken> & ProviderBuilder<TToken>
export function provide<TToken extends TokenLike>(
  token: TToken,
  options?: ProviderScopeOptions,
): ProviderBuilder<TToken>
export function provide<TToken extends TokenLike>(
  token: TToken,
  options: ProviderScopeOptions = {},
) {
  const scope = options.scope ?? 'application'
  return {
    ...(typeof token === 'function' ? { kind: 'self-class' as const } : {}),
    provide: token,
    scope,
    useClass(implementation: Class<TokenValue<TToken>>): ClassProvider<TToken> {
      return {
        kind: 'class',
        provide: token,
        useClass: implementation,
        scope,
      }
    },

    useValue(value: TokenValue<TToken>): ValueProvider<TToken> {
      return {
        kind: 'value',
        provide: token,
        useValue: value,
        scope,
      }
    },

    useFactory(
      definition: FactoryDefinition<TokenValue<TToken>>,
    ): FactoryProvider<TToken> {
      return {
        kind: 'factory',
        provide: token,
        inject: definition.inject ?? [],
        useFactory: definition.use,
        scope,
      }
    },

    select<TKey extends PropertyKey>(
      key: RuntimeInputKey<TKey>,
      mapping: Readonly<Record<TKey, Class<TokenValue<TToken>>>>,
    ): ConditionalProvider<TToken> {
      return {
        kind: 'conditional',
        provide: token,
        select: key as RuntimeInputKey<PropertyKey>,
        mapping,
        scope,
      }
    },
  }
}

export function environmentProvider(
  environment: EnvClass,
): EnvironmentProvider {
  return {
    kind: 'environment',
    provide: environment,
    scope: 'application',
  }
}

export function argumentsProvider(
  argumentsContract: ArgsClass,
): ArgumentsProvider {
  return {
    kind: 'arguments',
    provide: argumentsContract,
    scope: 'application',
  }
}

export function normalizeProvider(
  declaration: ProviderDeclaration,
): ProviderDescriptor {
  if (typeof declaration === 'function') {
    return {
      kind: 'class',
      provide: declaration,
      useClass: declaration,
      scope: 'application',
    }
  }

  if (declaration.kind === 'self-class') {
    return {
      kind: 'class',
      provide: declaration.provide,
      useClass: declaration.provide,
      scope: declaration.scope,
    }
  }

  return declaration
}
