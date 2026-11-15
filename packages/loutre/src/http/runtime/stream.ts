import {
  type HttpResponseStreamControl,
  type ServerSentEventStreamControl,
} from './types.js'
import { type StandardSchemaV1, validateSchema } from '../../core/index.js'
import {
  AsyncIteratorLifecycle,
  AsyncIteratorCleanupDeadlineError,
} from '../../core/async-iterator-lifecycle.js'
import { type EpochMs, epochMilliseconds } from '../../core/units.js'

export function createLeasedReadableStream(
  source: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  completeExecution: () => void,
): HttpResponseStreamControl {
  const reader = source.getReader()
  let finished = false
  let completed = false
  let inFlightOperations = 0
  let cleanupSettled = true
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  let cleanup: Promise<void> | undefined
  let resolveFinished!: () => void
  const finishedPromise = new Promise<void>((resolve) => {
    resolveFinished = resolve
  })

  const markFinished = () => {
    if (finished) return false
    finished = true
    signal.removeEventListener('abort', abort)
    return true
  }
  const completeIfSafe = () => {
    if (completed || !finished || !cleanupSettled || inFlightOperations > 0) {
      return
    }
    completed = true
    try {
      reader.releaseLock()
    } catch {
      // pending中のreader操作がsettleするまではlockを解放できない。
    }
    try {
      completeExecution()
    } finally {
      resolveFinished()
    }
  }
  const stop = (reason: unknown, errorStream: boolean): Promise<void> => {
    if (cleanup) return cleanup
    if (!markFinished()) return finishedPromise
    cleanupSettled = false
    cleanup = (async () => {
      let cleanupError: unknown
      try {
        await reader.cancel(reason)
      } catch (error) {
        cleanupError = error
      } finally {
        cleanupSettled = true
        if (errorStream) {
          controller?.error(
            cleanupError ?? reason ?? new Error('HTTP request was aborted'),
          )
        }
        completeIfSafe()
      }
      await finishedPromise
      if (cleanupError !== undefined) throw cleanupError
    })()
    return cleanup
  }
  const abort = () => {
    void stop(signal.reason, true).catch(() => undefined)
  }

  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    },
    async pull(value) {
      if (finished) return
      inFlightOperations += 1
      try {
        const next = await reader.read()
        if (finished) return
        if (next.done) {
          if (markFinished()) value.close()
          return
        }
        value.enqueue(next.value)
      } catch (error) {
        if (markFinished()) value.error(error)
      } finally {
        inFlightOperations -= 1
        completeIfSafe()
      }
    },
    cancel(reason) {
      return stop(reason, false)
    },
  })
  return {
    stream,
    finished: finishedPromise,
    abort: (reason) => stop(reason, true),
  }
}

export function createServerSentEventStream(
  source: AsyncIterable<unknown>,
  schema: StandardSchemaV1,
  signal: AbortSignal,
  completeExecution: () => void,
): ServerSentEventStreamControl {
  const encoder = new TextEncoder()
  const iterator = new AsyncIteratorLifecycle(source[Symbol.asyncIterator]())
  let finished = false
  let completed = false
  let inFlightOperations = 0
  let cleanupComplete = false
  let cleanupSettled = true
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  let cleanupAttempt: Promise<void> | undefined
  let cleanupDeadline: EpochMs | undefined
  let resolveFinished!: () => void
  const finishedPromise = new Promise<void>((resolve) => {
    resolveFinished = resolve
  })

  const markFinished = () => {
    if (finished) return false
    finished = true
    signal.removeEventListener('abort', abort)
    return true
  }
  const completeIfSafe = () => {
    if (completed || !finished || !cleanupSettled || inFlightOperations > 0) {
      return
    }
    completed = true
    try {
      completeExecution()
    } finally {
      resolveFinished()
    }
  }
  const stop = (
    reason: unknown,
    errorStream: boolean,
    deadline?: EpochMs,
  ): Promise<void> => {
    if (cleanupAttempt) {
      if (deadline !== undefined) {
        cleanupDeadline = epochMilliseconds(
          Math.min(cleanupDeadline ?? deadline, deadline),
        )
      }
      return cleanupAttempt
    }
    if (deadline !== undefined) cleanupDeadline = deadline
    markFinished()
    if (cleanupComplete) return finishedPromise
    cleanupSettled = false
    const operation = (async () => {
      let cleanupError: unknown
      try {
        await iterator.drain(
          reason,
          () => cleanupDeadline,
          'HTTP iterator cleanup exceeded the drain deadline.',
        )
      } catch (error) {
        if (error instanceof AsyncIteratorCleanupDeadlineError) throw error
        cleanupError = error
      } finally {
        if (iterator.done || cleanupError !== undefined) {
          cleanupComplete = true
          cleanupSettled = true
          if (errorStream) {
            controller?.error(
              cleanupError ?? reason ?? new Error('HTTP request was aborted'),
            )
          }
          completeIfSafe()
        }
      }
      await finishedPromise
      if (cleanupError !== undefined) throw cleanupError
    })()
    cleanupAttempt = operation
    void operation.then(
      () => {
        if (cleanupAttempt === operation) cleanupAttempt = undefined
      },
      () => {
        if (cleanupAttempt === operation) cleanupAttempt = undefined
      },
    )
    return operation
  }
  const abort = () => {
    void stop(signal.reason, true).catch(() => undefined)
  }

  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    },
    async pull(value) {
      if (finished) return
      inFlightOperations += 1
      let stopPromise: Promise<void> | undefined
      try {
        const next = await iterator.next()
        if (finished) return
        if (next.done) {
          if (markFinished()) value.close()
          return
        }
        const item = await validateSchema(schema, next.value)
        if (finished) return
        value.enqueue(encoder.encode(`data:${JSON.stringify(item)}\n\n`))
      } catch (error) {
        stopPromise = stop(error, true)
      } finally {
        inFlightOperations -= 1
        completeIfSafe()
      }
      await stopPromise
    },
    cancel(reason) {
      return stop(reason, false)
    },
  })
  return {
    stream,
    finished: finishedPromise,
    setDrainDeadline(deadline) {
      cleanupDeadline = deadline
    },
    abort: (reason, deadline) => stop(reason, true, deadline),
  }
}
