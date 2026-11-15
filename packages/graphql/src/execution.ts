import * as GraphQL from 'graphql'
import { AsyncIteratorLifecycle } from '@loutrejs/loutre'
import type {
  ExecutionArgs,
  ExecutionResult,
  DocumentNode,
  GraphQLError,
  ValidatedSubscriptionArgs,
  ValidatedExecutionArgs,
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
    return await executeAndWait(
      () =>
        GraphQL.validateExecutionArgs({
          ...args,
          schema: bound.schema,
          contextValue: view.context,
        }),
      GraphQL.executeRootSelectionSet,
      view,
    )
  } finally {
    options.annotate?.(statisticsAttributes(stats))
  }
}

async function executeAndWait<TArgs extends ValidatedExecutionArgs>(
  prepare: () => TArgs | readonly GraphQLError[],
  execute: (args: TArgs) => ExecutionResult | Promise<ExecutionResult>,
  view: { close(): Promise<void> },
): Promise<ExecutionResult> {
  const finished = Promise.withResolvers<void>()
  let started = false
  try {
    const args = prepare()
    if (!('schema' in args)) return { errors: args }
    started = true
    return await execute({
      ...args,
      hooks: {
        ...args.hooks,
        asyncWorkFinished(info) {
          finished.resolve()
          args.hooks?.asyncWorkFinished?.(info)
        },
      },
    })
  } finally {
    await view.close()
    if (started) await finished.promise
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
  let validated: ValidatedSubscriptionArgs
  let source
  try {
    const result = GraphQL.validateSubscriptionArgs(sourceArgs)
    if (!('schema' in result)) {
      await sourceView.close()
      return { errors: result }
    }
    validated = result
    source = await GraphQL.createSourceEventStream(validated)
  } catch (error) {
    await sourceView.close()
    if (error instanceof GraphQL.GraphQLError) return { errors: [error] }
    throw error
  }
  if (!(Symbol.asyncIterator in source)) {
    await sourceView.close()
    return source
  }
  const iterator = new AsyncIteratorLifecycle(source[Symbol.asyncIterator]())
  const pending = new Set<Promise<IteratorResult<ExecutionResult>>>()
  let returning: Promise<IteratorResult<ExecutionResult>> | undefined
  const next = async (): Promise<IteratorResult<ExecutionResult>> => {
    try {
      const event = await iterator.next()
      if (event.done || options.signal.aborted) {
        await sourceView.close()
        return { done: true, value: undefined }
      }
      const view = executionView(
        bound,
        args.contextValue,
        options.signal,
        stats,
      )
      try {
        const value = await executeAndWait(
          () => ({
            ...validated,
            rootValue: event.value,
            contextValue: view.context,
          }),
          GraphQL.executeSubscriptionEvent,
          view,
        )
        return { done: false, value }
      } finally {
        options.annotate?.(statisticsAttributes(stats))
      }
    } catch (error) {
      await sourceView.close()
      throw error
    }
  }
  const mapped: AsyncIterableIterator<ExecutionResult> = {
    [Symbol.asyncIterator]() {
      return this
    },
    next() {
      if (returning || options.signal.aborted)
        return Promise.resolve({ done: true, value: undefined })
      const operation = next()
      pending.add(operation)
      void operation.then(
        () => pending.delete(operation),
        () => pending.delete(operation),
      )
      return operation
    },
    return() {
      returning ??= Promise.resolve().then(async () => {
        try {
          await iterator.drain(
            undefined,
            () => undefined,
            'GraphQL Subscriptionのcleanupが終了していません。',
          )
        } finally {
          await iterator.waitForIdle()
          await Promise.allSettled(pending)
          await sourceView.close()
        }
        return { done: true as const, value: undefined }
      })
      return returning
    },
  }
  return mapped
}
