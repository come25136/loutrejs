export type ShutdownSignal = 'SIGINT' | 'SIGTERM'

export interface ProcessSignalSource {
  once(signal: ShutdownSignal, handler: () => void): unknown
  off(signal: ShutdownSignal, handler: () => void): unknown
}

export interface ProcessShutdownHooksOptions {
  readonly source: ProcessSignalSource
  readonly close: (signal: ShutdownSignal) => Promise<void>
  readonly onError: (error: unknown, signal: ShutdownSignal) => void
}

export class ProcessShutdownHooks {
  readonly #handlers = new Map<ShutdownSignal, () => void>()
  readonly #options: ProcessShutdownHooksOptions
  #disposed = false

  constructor(options: ProcessShutdownHooksOptions) {
    this.#options = options
  }

  setEnabled(enabled: boolean): void {
    if (this.#disposed) return
    if (!enabled) {
      this.#removeHandlers()
      return
    }
    if (this.#handlers.size > 0) return
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      const handler = () => {
        if (this.#disposed) return
        this.dispose()
        void this.#close(signal)
      }
      this.#handlers.set(signal, handler)
      this.#options.source.once(signal, handler)
    }
  }

  dispose(): void {
    this.#disposed = true
    this.#removeHandlers()
  }

  #removeHandlers(): void {
    for (const [signal, handler] of this.#handlers) {
      this.#options.source.off(signal, handler)
    }
    this.#handlers.clear()
  }

  async #close(signal: ShutdownSignal): Promise<void> {
    try {
      await this.#options.close(signal)
    } catch (error) {
      try {
        this.#options.onError(error, signal)
      } catch (reportingError) {
        console.error(
          'Runtime shutdown error reporter failed',
          error,
          reportingError,
        )
      }
    }
  }
}
