import type { TokenLike, TokenValue } from './token.js'

export interface OnModuleInit {
  onModuleInit(): void | Promise<void>
}

export interface OnApplicationBootstrap {
  onApplicationBootstrap(): void | Promise<void>
}

export interface OnModuleDestroy {
  onModuleDestroy(): void | Promise<void>
}

export interface BeforeApplicationShutdown {
  beforeApplicationShutdown(signal?: string): void | Promise<void>
}

export interface OnApplicationShutdown {
  onApplicationShutdown(signal?: string): void | Promise<void>
}

export interface LifecycleHook<
  TInject extends readonly TokenLike[] = readonly TokenLike[],
> {
  readonly kind: 'lifecycle-hook'
  readonly inject: TInject
  readonly run: (
    ...dependencies: { [K in keyof TInject]: TokenValue<TInject[K]> }
  ) => void | Promise<void>
}

export function hook<const TInject extends readonly TokenLike[]>(definition: {
  readonly inject: TInject
  readonly run: LifecycleHook<TInject>['run']
}): LifecycleHook<TInject> {
  return { kind: 'lifecycle-hook', ...definition }
}

export interface ModuleLifecycle {
  readonly onModuleInit?: LifecycleHook<any>
  readonly onApplicationBootstrap?: LifecycleHook<any>
  readonly onModuleDestroy?: LifecycleHook<any>
  readonly beforeApplicationShutdown?: LifecycleHook<any>
  readonly onApplicationShutdown?: LifecycleHook<any>
}
