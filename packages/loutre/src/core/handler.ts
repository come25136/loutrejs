import { match } from 'ts-pattern'
import type {
  ExecutionDelegation,
  ExecutionHandlerSource,
  ExecutionHandlerResolver,
} from './extension.js'
import {
  collectInjectedDependencies,
  runInInjectionContext,
  type DependencyConsumerDescriptor,
} from './injection.js'
import type { TokenLike } from './token.js'

export interface CompiledExecutionHandler<
  THandler,
> extends ExecutionHandlerResolver<THandler> {
  readonly dependencies: readonly TokenLike[]
  readonly delegations: readonly ExecutionDelegation<unknown>[]
}

export type ExecutionMethod = (...arguments_: readonly unknown[]) => unknown

type MethodKeys<T> = {
  [K in keyof T]-?: T[K] extends (...args: never[]) => unknown ? K : never
}[keyof T]

export type DeclaredExecutionMethods<TActual, TDeclared> =
  Exclude<
    Extract<MethodKeys<TActual>, string | number>,
    keyof TDeclared
  > extends never
    ? unknown
    : never

export function assertDeclaredExecutionMethods(
  value: object,
  names: readonly string[],
): void {
  const declared = new Set(names)
  const visited = new Set<string>()
  for (
    let owner: object | null = value;
    owner && owner !== Object.prototype;
    owner = Object.getPrototypeOf(owner)
  ) {
    for (const [name, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(owner),
    )) {
      if (visited.has(name)) continue
      visited.add(name)
      if (
        typeof descriptor.value === 'function' &&
        !(name === 'constructor' && descriptor.value.prototype === owner) &&
        !declared.has(name)
      ) {
        throw new TypeError(`Undeclared execution method: ${name}`)
      }
    }
  }
}

export function resolveExecutionMethod(
  value: unknown,
  name: string,
): ExecutionMethod | undefined {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  )
    return undefined
  const method: unknown = Reflect.get(value, name)
  if (Object.hasOwn(Object.prototype, name)) {
    let owner: object | null = value
    while (owner && !Object.hasOwn(owner, name))
      owner = Object.getPrototypeOf(owner)
    if (
      owner === Object.prototype ||
      (name === 'constructor' &&
        typeof method === 'function' &&
        method.prototype === owner)
    )
      return undefined
  }
  if (typeof method !== 'function') return undefined
  return (...arguments_) => Reflect.apply(method, value, arguments_)
}

export function compileExecutionHandler<THandler>(
  source: ExecutionHandlerSource<THandler>,
  consumer: DependencyConsumerDescriptor,
): CompiledExecutionHandler<THandler> {
  return match(source)
    .returnType<CompiledExecutionHandler<THandler>>()
    .with({ kind: 'factory' }, ({ factory }) => ({
      dependencies: collectInjectedDependencies(consumer, factory),
      delegations: [],
      createResolver({ resolve }) {
        const handler = runInInjectionContext(
          {
            consumer,
            resolve: (token, owner) => resolve(token, { consumer: owner }),
          },
          factory,
        )
        return () => handler
      },
    }))
    .with({ kind: 'delegate' }, ({ delegate }) => ({
      dependencies: [],
      delegations: [delegate],
      createResolver:
        ({ resolveDelegate }) =>
        () =>
          resolveDelegate(delegate.handle),
    }))
    .exhaustive()
}
