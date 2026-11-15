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
