import {
  type StandardSchemaV1,
  type ExecutionKernelRuntime,
  validateSchema,
} from '../../core/index.js'
import { type EpochMs, epochMilliseconds } from '../../core/units.js'
import {
  AsyncIteratorLifecycle,
  AsyncIteratorCleanupDeadlineError,
} from '../../core/async-iterator-lifecycle.js'

export function createLeasedMessagePortStream(
  schema: StandardSchemaV1,
  source: AsyncIterable<unknown>,
  lease: ReturnType<ExecutionKernelRuntime['beginExecution']>,
  activeStreams: Set<{
    abort(reason: unknown, deadline: EpochMs): Promise<void>
  }>,
): AsyncIterable<unknown> & { cancel(reason?: unknown): Promise<void> } {
  const iterator = new AsyncIteratorLifecycle(source[Symbol.asyncIterator]())
  let finished = false
  let completed = false
  let inFlightOperations = 0
  let cancellationSettled = true
  let cancellation: Promise<void> | undefined
  let iteratorCleanup: Promise<void> | undefined
  let iteratorCleanupDeadline: EpochMs | undefined
  let iteratorCleanupComplete = false
  let resolveCompleted!: () => void
  const completedPromise = new Promise<void>((resolve) => {
    resolveCompleted = resolve
  })
  let control: {
    abort(reason: unknown, deadline: EpochMs): Promise<void>
  }

  const markFinished = () => {
    if (finished) return false
    finished = true
    lease.signal.removeEventListener('abort', onAbort)
    return true
  }
  const completeIfSafe = () => {
    if (
      completed ||
      !finished ||
      !cancellationSettled ||
      inFlightOperations > 0
    ) {
      return
    }
    completed = true
    activeStreams.delete(control)
    try {
      lease.complete()
    } finally {
      resolveCompleted()
    }
  }
  const startIteratorCleanup = (
    reason?: unknown,
    deadline?: EpochMs,
  ): Promise<void> => {
    if (iteratorCleanup) {
      if (deadline !== undefined) {
        iteratorCleanupDeadline = epochMilliseconds(
          Math.min(iteratorCleanupDeadline ?? deadline, deadline),
        )
      }
      return iteratorCleanup
    }
    if (deadline !== undefined) iteratorCleanupDeadline = deadline
    markFinished()
    if (iteratorCleanupComplete) return Promise.resolve()
    cancellationSettled = false
    const operation = (async () => {
      try {
        await iterator.drain(
          reason,
          () => iteratorCleanupDeadline,
          'MessagePort iterator cleanup exceeded the drain deadline.',
        )
      } catch (error) {
        if (error instanceof AsyncIteratorCleanupDeadlineError) throw error
        iteratorCleanupComplete = true
        cancellationSettled = true
        throw error
      } finally {
        if (iterator.done) iteratorCleanupComplete = true
        if (iteratorCleanupComplete) cancellationSettled = true
        completeIfSafe()
      }
    })()
    iteratorCleanup = operation
    void operation.then(
      () => {
        if (iteratorCleanup === operation) iteratorCleanup = undefined
      },
      () => {
        if (iteratorCleanup === operation) iteratorCleanup = undefined
      },
    )
    return operation
  }
  const cancel = (reason?: unknown): Promise<void> => {
    if (cancellation) return cancellation
    cancellation = (async () => {
      let cleanupError: unknown
      try {
        await startIteratorCleanup(reason)
      } catch (error) {
        cleanupError = error
      }
      await completedPromise
      if (cleanupError !== undefined) throw cleanupError
    })()
    return cancellation
  }
  const onAbort = () => {
    // AbortSignalはasync cleanup errorを返せないため、error伝播が必要なdrainはcontrol.abort()を直接awaitする。
    void cancel(lease.signal.reason).catch(() => undefined)
  }
  control = {
    async abort(reason, deadline) {
      iteratorCleanupDeadline = deadline
      lease.abort(reason)
      const cleanup = startIteratorCleanup(reason, deadline)
      await cleanup
      await completedPromise
    },
  }
  activeStreams.add(control)
  if (lease.signal.aborted) onAbort()
  else lease.signal.addEventListener('abort', onAbort, { once: true })

  const closeAfterError = async (error: unknown): Promise<never> => {
    lease.fail?.(error)
    let cleanupError: unknown
    try {
      await startIteratorCleanup(error)
    } catch (caught) {
      cleanupError = caught
    }
    if (cleanupError !== undefined) {
      throw new AggregateError(
        [error, cleanupError],
        'MessagePort stream validation and cleanup failed.',
        { cause: error },
      )
    }
    throw error
  }
  const validateResult = async (
    result: IteratorResult<unknown>,
  ): Promise<IteratorResult<unknown>> => {
    if (result.done) {
      markFinished()
      return result
    }
    try {
      return {
        done: false,
        value: await validateSchema(schema, result.value),
      }
    } catch (error) {
      return closeAfterError(error)
    }
  }

  const wrapped: AsyncIterator<unknown> = {
    async next() {
      if (finished) return { done: true, value: undefined }
      inFlightOperations += 1
      try {
        return await validateResult(await iterator.next())
      } catch (error) {
        if (finished) throw error
        return await closeAfterError(error)
      } finally {
        inFlightOperations -= 1
        completeIfSafe()
      }
    },
    async return(reason?: unknown) {
      if (finished) return { done: true, value: reason }
      inFlightOperations += 1
      try {
        const result = await iterator.return(reason)
        if (result.done) {
          markFinished()
        }
        return result
      } catch (error) {
        markFinished()
        throw error
      } finally {
        inFlightOperations -= 1
        completeIfSafe()
      }
    },
    async throw(error?: unknown) {
      if (finished) throw error
      inFlightOperations += 1
      try {
        return await validateResult(await iterator.throw(error))
      } catch (caught) {
        if (finished) throw caught
        return await closeAfterError(caught)
      } finally {
        inFlightOperations -= 1
        completeIfSafe()
      }
    },
  }

  return {
    [Symbol.asyncIterator]() {
      return wrapped
    },
    cancel,
  }
}

export function isAsyncIterable(
  value: unknown,
): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  )
}
