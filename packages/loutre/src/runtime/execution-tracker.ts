import type { ExecutionLease } from '../core/index.js'

interface ActiveExecution extends ExecutionLease {
  readonly controller: AbortController
  completed: boolean
}

export class ExecutionTracker {
  readonly #active = new Set<ActiveExecution>()
  readonly #idleWaiters = new Set<() => void>()

  get size(): number {
    return this.#active.size
  }

  begin(): ExecutionLease {
    const controller = new AbortController()
    const lease: ActiveExecution = {
      controller,
      signal: controller.signal,
      completed: false,
      abort: (reason?: unknown) => controller.abort(reason),
      complete: () => {
        if (lease.completed) return
        lease.completed = true
        if (!controller.signal.aborted) controller.abort()
        this.#active.delete(lease)
        if (this.#active.size !== 0) return
        for (const resolve of this.#idleWaiters) resolve()
        this.#idleWaiters.clear()
      },
    }
    this.#active.add(lease)
    return lease
  }

  abortAll(reason: unknown): void {
    for (const execution of this.#active) execution.abort(reason)
  }

  waitForIdle(timeoutMs?: number): Promise<void> {
    if (this.#active.size === 0) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const resolveWhenIdle = () => {
        if (timer !== undefined) clearTimeout(timer)
        resolve()
      }
      this.#idleWaiters.add(resolveWhenIdle)
      if (timeoutMs === undefined) return
      timer = setTimeout(() => {
        this.#idleWaiters.delete(resolveWhenIdle)
        reject(
          new Error(
            `LUTRE_APPLICATION_FORCE_SHUTDOWN_TIMEOUT: ${this.#active.size} active execution(s) did not complete within ${timeoutMs}ms.`,
          ),
        )
      }, timeoutMs)
    })
  }
}
