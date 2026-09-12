const cleanupYieldInterval = 32

export class AsyncIteratorCleanupDeadlineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AsyncIteratorCleanupDeadlineError'
  }
}

export class AsyncIteratorLifecycle<T> {
  readonly #iterator: AsyncIterator<T>
  readonly #idleWaiters = new Set<() => void>()
  #inFlight = 0
  #returnPending = false
  #returnContinuationPending = false
  #done = false

  constructor(iterator: AsyncIterator<T>) {
    this.#iterator = iterator
  }

  get done(): boolean {
    return this.#done
  }

  async next(): Promise<IteratorResult<T>> {
    return this.#run(() => this.#iterator.next())
  }

  async return(reason?: unknown): Promise<IteratorResult<T>> {
    if (!this.#iterator.return) {
      const result = { done: true as const, value: reason as T }
      this.#record(result)
      return result
    }
    this.#returnPending = true
    try {
      const result = await this.#run(() => this.#iterator.return!(reason))
      this.#returnContinuationPending = !result.done
      return result
    } finally {
      this.#returnPending = false
    }
  }

  async throw(error?: unknown): Promise<IteratorResult<T>> {
    if (!this.#iterator.throw) throw error
    return this.#run(() => this.#iterator.throw!(error))
  }

  async drain(
    reason: unknown,
    deadline: () => number | undefined,
    timeoutMessage: string,
  ): Promise<void> {
    if (this.#returnPending) await this.#waitForIdle()
    if (this.#done) return
    if (!this.#returnContinuationPending) {
      const result = await this.return(reason)
      if (result.done) return
    }
    await this.#waitForIdle()
    let continuationSteps = 0
    while (!this.#done) {
      const currentDeadline = deadline()
      if (currentDeadline !== undefined && Date.now() >= currentDeadline) {
        throw new AsyncIteratorCleanupDeadlineError(timeoutMessage)
      }
      await this.next()
      continuationSteps += 1
      if (continuationSteps % cleanupYieldInterval === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    }
  }

  async #run<TResult extends IteratorResult<T>>(
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    this.#inFlight += 1
    try {
      return this.#record(await operation())
    } finally {
      this.#inFlight -= 1
      if (this.#inFlight === 0) {
        for (const resolve of this.#idleWaiters) resolve()
        this.#idleWaiters.clear()
      }
    }
  }

  #record<TResult extends IteratorResult<T>>(result: TResult): TResult {
    if (result.done) {
      this.#done = true
      this.#returnContinuationPending = false
    }
    return result
  }

  #waitForIdle(): Promise<void> {
    return this.#inFlight === 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => this.#idleWaiters.add(resolve))
  }
}
