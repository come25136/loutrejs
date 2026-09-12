export class IngressGate {
  #accepting = true
  #pending = 0
  readonly #idleWaiters = new Set<() => void>()

  get isAccepting(): boolean {
    return this.#accepting
  }

  enter(): (() => void) | undefined {
    if (!this.#accepting) return undefined
    this.#pending += 1
    let completed = false
    return () => {
      if (completed) return
      completed = true
      this.#pending -= 1
      if (this.#pending !== 0) return
      for (const resolve of this.#idleWaiters) resolve()
      this.#idleWaiters.clear()
    }
  }

  stopAccepting(): void {
    this.#accepting = false
  }

  waitForIdle(): Promise<void> {
    return this.#pending === 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => this.#idleWaiters.add(resolve))
  }
}
