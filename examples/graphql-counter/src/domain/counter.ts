import { EventEmitter, on } from 'node:events'

export interface Counter {
  readonly value: number
  readonly stepId: string
}

export interface CounterChanged {
  readonly counterChanged: Counter
}

export class CounterRangeError extends Error {}

export class CounterStore {
  readonly #events = new EventEmitter()
  #value = 0
  #activeSubscriptions = 0

  constructor() {
    this.#events.setMaxListeners(0)
  }

  get activeSubscriptions() {
    return this.#activeSubscriptions
  }

  current(): Counter {
    return { value: this.#value, stepId: 'default' }
  }

  increment(amount: number): Counter {
    return this.reset(this.#value + amount)
  }

  reset(value: number): Counter {
    if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
      throw new CounterRangeError(
        'カウンターはGraphQL Intの範囲で指定してください。',
      )
    }
    this.#value = value
    const counter = this.current()
    this.#events.emit('changed', counter)
    return counter
  }

  async *watch(signal: AbortSignal): AsyncGenerator<CounterChanged> {
    const events = on(this.#events, 'changed', { signal })
    this.#activeSubscriptions++
    try {
      yield { counterChanged: this.current() }
      for await (const [counter] of events) {
        yield { counterChanged: counter as Counter }
      }
    } catch (error) {
      if (!signal.aborted) throw error
    } finally {
      await events.return?.()
      this.#activeSubscriptions--
    }
  }
}
