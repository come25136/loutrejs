export class WebSocketMessageDecodeError extends Error {
  constructor(cause?: unknown) {
    super('WebSocket message could not be decoded.', { cause })
    this.name = 'WebSocketMessageDecodeError'
  }
}

export class WebSocketMessageEncodeError extends Error {
  constructor(cause?: unknown) {
    super('WebSocket message could not be encoded.', { cause })
    this.name = 'WebSocketMessageEncodeError'
  }
}

export class WebSocketConnectionNotOpenError extends Error {
  constructor(cause?: unknown) {
    super('WebSocket connection is not open.', { cause })
    this.name = 'WebSocketConnectionNotOpenError'
  }
}
