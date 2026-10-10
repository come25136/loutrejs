import * as GraphQL from 'graphql'
import type {
  ExecutionArgs,
  ExecutionResult,
  DocumentNode,
  GraphQLError,
  ValidatedSubscriptionArgs,
} from 'graphql'
import type { BoundManifest } from './manifest-internal.js'
import {
  executionView,
  statistics,
  statisticsAttributes,
  type DataStatistics,
} from './scope.js'

interface Options {
  readonly signal: AbortSignal
  readonly stats?: DataStatistics
  readonly annotate?: (attributes: Readonly<Record<string, unknown>>) => void
}

export function incrementalErrors(document: DocumentNode): GraphQLError[] {
  const errors: GraphQLError[] = []
  GraphQL.visit(document, {
    Directive(node) {
      if (node.name.value === 'defer' || node.name.value === 'stream')
        errors.push(
          new GraphQL.GraphQLError(
            `@${node.name.value}はこのExecution Adapterで使用できません。`,
            { nodes: node },
          ),
        )
    },
  })
  return errors
}

export async function executeManifest(
  bound: BoundManifest,
  args: ExecutionArgs,
  options: Options,
): Promise<ExecutionResult> {
  const errors = incrementalErrors(args.document)
  if (errors.length) return { errors }
  const stats = options.stats ?? statistics()
  const view = executionView(bound, args.contextValue, options.signal, stats)
  try {
    return await GraphQL.execute({
      ...args,
      schema: bound.schema,
      contextValue: view.context,
    })
  } finally {
    view.close()
    options.annotate?.(statisticsAttributes(stats))
  }
}

export async function subscribeManifest(
  bound: BoundManifest,
  args: ExecutionArgs,
  options: Options,
): Promise<ExecutionResult | AsyncIterableIterator<ExecutionResult>> {
  const errors = incrementalErrors(args.document)
  if (errors.length) return { errors }
  const stats = options.stats ?? statistics()
  const sourceView = executionView(
    bound,
    args.contextValue,
    options.signal,
    stats,
  )
  const sourceArgs = {
    ...args,
    schema: bound.schema,
    contextValue: sourceView.context,
  }
  const compatible = GraphQL as typeof GraphQL & {
    validateSubscriptionArgs?: typeof GraphQL.validateSubscriptionArgs
    createSourceEventStream: (
      input: ExecutionArgs,
    ) => ReturnType<typeof GraphQL.createSourceEventStream>
  }
  let validated: ValidatedSubscriptionArgs | undefined
  let source
  try {
    if (compatible.validateSubscriptionArgs) {
      const result = compatible.validateSubscriptionArgs(sourceArgs)
      if (!('schema' in result)) {
        sourceView.close()
        return { errors: result }
      }
      validated = result
      source = await GraphQL.createSourceEventStream(validated)
    } else {
      // v16は未検証ExecutionArgsを受け取るため、v17の宣言だけでは表現できない。
      source = await compatible.createSourceEventStream(sourceArgs)
    }
  } catch (error) {
    sourceView.close()
    if (error instanceof GraphQL.GraphQLError) return { errors: [error] }
    throw error
  }
  if (!(Symbol.asyncIterator in source)) {
    sourceView.close()
    return source
  }
  const iterator = source[Symbol.asyncIterator]()
  let returning: Promise<IteratorResult<ExecutionResult>> | undefined
  const mapped: AsyncIterableIterator<ExecutionResult> = {
    [Symbol.asyncIterator]() {
      return this
    },
    async next() {
      if (returning || options.signal.aborted)
        return { done: true, value: undefined }
      const event = await iterator.next()
      if (event.done || options.signal.aborted) {
        sourceView.close()
        return { done: true, value: undefined }
      }
      const view = executionView(
        bound,
        args.contextValue,
        options.signal,
        stats,
      )
      try {
        const value = validated
          ? await GraphQL.executeSubscriptionEvent({
              ...validated,
              rootValue: event.value,
              contextValue: view.context,
            })
          : await GraphQL.execute({
              ...args,
              rootValue: event.value,
              contextValue: view.context,
            })
        return { done: false, value }
      } finally {
        view.close()
        options.annotate?.(statisticsAttributes(stats))
      }
    },
    return() {
      returning ??= Promise.resolve().then(async () => {
        sourceView.close()
        await iterator.return?.()
        return { done: true as const, value: undefined }
      })
      return returning
    },
  }
  return mapped
}
