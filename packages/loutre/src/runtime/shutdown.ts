export class ApplicationShutdownError extends AggregateError {
  readonly safeCleanupBoundaryReached: boolean

  constructor(
    errors: readonly unknown[],
    message: string,
    options: ErrorOptions & { readonly safeCleanupBoundaryReached: boolean },
  ) {
    super(errors, message, options)
    this.name = 'ApplicationShutdownError'
    this.safeCleanupBoundaryReached = options.safeCleanupBoundaryReached
  }
}

export interface RuntimeShutdownOptions {
  readonly message: string
  readonly beginClose: () => Promise<void>
  readonly closeApplication: (signal?: string) => Promise<void>
  readonly closeResources: (
    safeCleanupBoundaryReached: boolean,
    resourceClosing: Promise<void>,
  ) => Promise<void>
}

export class RuntimeShutdown {
  readonly #options: RuntimeShutdownOptions
  #started = false
  #closed = false
  #closing: Promise<void> | undefined

  constructor(options: RuntimeShutdownOptions) {
    this.#options = options
  }

  get started(): boolean {
    return this.#started
  }

  close(signal?: string): Promise<void> {
    if (this.#closed) return Promise.resolve()
    if (this.#closing) return this.#closing
    this.#started = true
    this.#closing = this.#close(signal).catch((error: unknown) => {
      this.#closing = undefined
      throw error
    })
    return this.#closing
  }

  async #close(signal?: string): Promise<void> {
    const errors: unknown[] = []
    let resourceClosing = Promise.resolve()
    try {
      resourceClosing = this.#options.beginClose()
      void resourceClosing.catch(() => undefined)
    } catch (error) {
      errors.push(error)
    }
    let safeCleanupBoundaryReached = false
    try {
      await this.#options.closeApplication(signal)
      safeCleanupBoundaryReached = true
    } catch (error) {
      errors.push(error)
      safeCleanupBoundaryReached =
        error instanceof ApplicationShutdownError &&
        error.safeCleanupBoundaryReached
    }
    try {
      await this.#options.closeResources(
        safeCleanupBoundaryReached,
        resourceClosing,
      )
    } catch (error) {
      errors.push(error)
    }
    if (errors.length > 0)
      throw new AggregateError(errors, this.#options.message)
    this.#closed = true
  }
}
