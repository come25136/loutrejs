export class ConnectionRejected {
  readonly #reason: string

  constructor(reason = '接続が拒否されました。') {
    if (new TextEncoder().encode(reason).byteLength > 123)
      throw new RangeError(
        '接続拒否の理由はUTF-8で123バイト以内にしてください。',
      )
    this.#reason = reason
  }

  get reason(): string {
    return this.#reason
  }
}
