import DataLoader from 'dataloader'
import type { Step, StepService } from '../domain/step.js'

export function createLoaders(steps: StepService, signal: AbortSignal) {
  return {
    step: new DataLoader<string, Step | null>(
      (ids) => steps.findByIds(ids, signal),
      { cache: false },
    ),
  }
}
