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
  readonly scope: 'application'
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

export type ProviderDeclaration = Class | ProviderDescriptor

export interface ProviderScopeOptions {
  readonly scope?: Scope
}

export interface FactoryDefinition<T> extends ProviderScopeOptions {
  readonly inject?: readonly TokenLike[]
  readonly use: (...dependencies: any[]) => T
}

export function provide<TToken extends TokenLike>(token: TToken) {
  return {
    useClass(
      implementation: Class<TokenValue<TToken>>,
      options: ProviderScopeOptions = {},
    ): ClassProvider<TToken> {
      return {
        kind: 'class',
        provide: token,
        useClass: implementation,
        scope: options.scope ?? 'application',
      }
    },

    useValue(value: TokenValue<TToken>): ValueProvider<TToken> {
      return {
        kind: 'value',
        provide: token,
        useValue: value,
        scope: 'application',
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
        scope: definition.scope ?? 'application',
      }
    },

    select<TKey extends PropertyKey>(
      key: RuntimeInputKey<TKey>,
      mapping: Readonly<Record<TKey, Class<TokenValue<TToken>>>>,
      options: ProviderScopeOptions = {},
    ): ConditionalProvider<TToken> {
      return {
        kind: 'conditional',
        provide: token,
        select: key as RuntimeInputKey<PropertyKey>,
        mapping,
        scope: options.scope ?? 'application',
      }
    },
  }
}

/** @internal Module.environmentからframework-managed providerを合成する。 */
export function environmentProvider(
  environment: EnvClass,
): EnvironmentProvider {
  return {
    kind: 'environment',
    provide: environment,
    scope: 'application',
  }
}

/** @internal Application.argumentsからframework-managed providerを合成する。 */
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

  return declaration
}
