import type { CounterStore } from '../domain/counter.js'
import type { StepService } from '../domain/step.js'

export interface AppContext {
  readonly counter: CounterStore
  readonly steps: StepService
  readonly signal: AbortSignal
}
