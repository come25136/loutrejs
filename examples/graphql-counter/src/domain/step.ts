export interface Step {
  readonly id: string
  readonly amount: number
}

export class StepService {
  #batchCount = 0
  get batchCount() {
    return this.#batchCount
  }
  async findByIds(
    ids: readonly string[],
    signal: AbortSignal,
  ): Promise<readonly (Step | null)[]> {
    signal.throwIfAborted()
    this.#batchCount++
    const steps = new Map(
      [...new Set(ids)].map((id) => [
        id,
        id === 'default' ? { id, amount: 1 } : null,
      ]),
    )
    return ids.map((id) => steps.get(id) ?? null)
  }
}
