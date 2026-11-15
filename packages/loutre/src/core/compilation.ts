import type {
  ExecutionCompileContext,
  ExecutionContribution,
  ExecutionDefinition,
  ExecutionDelegation,
  ExecutionExtension,
} from './extension.js'
import { compileExecutionHandler } from './handler.js'
import { collectInjectedDependencies } from './injection.js'
import type { TokenLike } from './token.js'

export type CollectedExecutionContribution<TCompiled = unknown> =
  ExecutionContribution<TCompiled> & {
    readonly dependencies: readonly TokenLike[]
    readonly delegations: readonly ExecutionDelegation<unknown>[]
  }

export function compileExecution<
  TDefinition extends ExecutionDefinition,
  TCompiled,
>(
  extension: Pick<ExecutionExtension<TDefinition, TCompiled>, 'compile'>,
  definition: TDefinition,
  location: Pick<ExecutionCompileContext, 'moduleId' | 'definitionIndex'>,
): CollectedExecutionContribution<TCompiled> {
  const dependencies = new Set<TokenLike>()
  const delegations = new Set<ExecutionDelegation<unknown>>()
  const context: ExecutionCompileContext = {
    ...location,
    compileHandler(source, consumer) {
      const handler = compileExecutionHandler(source, consumer)
      for (const token of handler.dependencies) dependencies.add(token)
      for (const delegation of handler.delegations) delegations.add(delegation)
      return Object.freeze({ createResolver: handler.createResolver })
    },
    collectDependencies(consumer, factory) {
      for (const token of collectInjectedDependencies(consumer, factory))
        dependencies.add(token)
    },
  }
  const contribution = extension.compile(definition, context)
  for (const token of contribution.dependencies ?? []) dependencies.add(token)
  for (const delegation of contribution.delegations ?? [])
    delegations.add(delegation)
  return {
    ...contribution,
    dependencies: Object.freeze([...dependencies]),
    delegations: Object.freeze([...delegations]),
  }
}
