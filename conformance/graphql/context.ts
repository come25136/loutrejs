export class ConformanceState {
  cleanupCount = 0
}
export interface AppContext {
  readonly signal: AbortSignal
  readonly state: ConformanceState
}
