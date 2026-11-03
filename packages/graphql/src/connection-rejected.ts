export class ConnectionRejected {
  readonly #reason: string

  constructor(reason = 'Connection rejected.') {
    if (new TextEncoder().encode(reason).byteLength > 123)
      throw new RangeError(
        'Connection rejection reason must not exceed 123 UTF-8 bytes.',
      )

    this.#reason = reason
  }

  get reason(): string {
    return this.#reason
  }
}
