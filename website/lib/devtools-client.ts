import { DEVTOOLS_PROTOCOL_VERSION } from './devtools-protocol'

export type DevtoolsClientEvent =
  | {
      readonly type: 'event'
      readonly event: 'graph.state'
      readonly payload: unknown
    }
  | {
      readonly type: 'event'
      readonly event: 'runtime.batch' | 'runtime.snapshot'
      readonly payload: unknown
    }

export type DevtoolsConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'

interface PendingRequest {
  readonly resolve: (value: unknown) => void
  readonly reject: (reason: unknown) => void
}

const clients = new Map<string, DevtoolsClient>()

export async function connectDevtools(baseUrl: string): Promise<void> {
  await clientFor(baseUrl).connect()
}

export function disconnectDevtools(baseUrl: string): void {
  const normalized = normalizeDevtoolsBaseUrl(baseUrl)
  const client = clients.get(normalized)
  if (!client) return
  clients.delete(normalized)
  client.close()
}

export function subscribeDevtoolsConnection(
  baseUrl: string,
  listener: (status: DevtoolsConnectionStatus) => void,
): () => void {
  return clientFor(baseUrl).subscribeConnection(listener)
}

export function subscribeDevtoolsEvents(
  baseUrl: string,
  listener: (event: DevtoolsClientEvent) => void,
): () => void {
  return clientFor(baseUrl).subscribe(listener)
}

export async function devtoolsRequest<T = unknown>(
  baseUrl: string,
  method: string,
  params?: unknown,
): Promise<T> {
  return clientFor(baseUrl).request<T>(method, params)
}

class DevtoolsClient {
  readonly #listeners = new Set<(event: DevtoolsClientEvent) => void>()
  readonly #connectionListeners = new Set<
    (status: DevtoolsConnectionStatus) => void
  >()
  readonly #pending = new Map<string, PendingRequest>()
  #socket: WebSocket | undefined
  #connectPromise: Promise<void> | undefined
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined
  #reconnectAttempt = 0
  #shouldReconnect = false
  #status: DevtoolsConnectionStatus = 'disconnected'

  constructor(readonly baseUrl: string) {}

  connect(): Promise<void> {
    this.#shouldReconnect = true
    if (this.#connectPromise) return this.#connectPromise
    if (this.#socket?.readyState === WebSocket.OPEN) {
      this.#setStatus('connected')
      return Promise.resolve()
    }
    if (this.#reconnectTimer !== undefined) {
      clearTimeout(this.#reconnectTimer)
      this.#reconnectTimer = undefined
    }
    return this.#openSocket(this.#status === 'reconnecting')
  }

  subscribe(listener: (event: DevtoolsClientEvent) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  subscribeConnection(
    listener: (status: DevtoolsConnectionStatus) => void,
  ): () => void {
    this.#connectionListeners.add(listener)
    listener(this.#status)
    return () => this.#connectionListeners.delete(listener)
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    await this.connect()
    const socket = this.#socket
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('Loutre DevTools is not connected.')
    }
    const id = crypto.randomUUID()
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      })
      try {
        socket.send(
          JSON.stringify({
            type: 'request',
            id,
            method,
            ...(params === undefined ? {} : { params }),
          }),
        )
      } catch (error) {
        this.#pending.delete(id)
        reject(error)
      }
    })
  }

  close(): void {
    this.#shouldReconnect = false
    this.#reconnectAttempt = 0
    if (this.#reconnectTimer !== undefined) {
      clearTimeout(this.#reconnectTimer)
      this.#reconnectTimer = undefined
    }
    const socket = this.#socket
    this.#socket = undefined
    this.#failPending(new Error('Loutre DevTools connection closed.'))
    this.#setStatus('disconnected')
    if (
      socket?.readyState === WebSocket.OPEN ||
      socket?.readyState === WebSocket.CONNECTING
    ) {
      socket.close()
    }
  }

  #openSocket(reconnecting: boolean): Promise<void> {
    if (this.#connectPromise) return this.#connectPromise
    this.#setStatus(reconnecting ? 'reconnecting' : 'connecting')

    const socket = new WebSocket(controlEndpoint(this.baseUrl))
    this.#socket = socket
    let settled = false
    let protocolAccepted = false
    let handshakeTimer: ReturnType<typeof setTimeout> | undefined

    const promise = new Promise<void>((resolve, reject) => {
      const rejectHandshake = (error: Error) => {
        if (settled) return
        settled = true
        if (handshakeTimer !== undefined) clearTimeout(handshakeTimer)
        this.#shouldReconnect = false
        if (this.#socket === socket) this.#socket = undefined
        this.#setStatus('disconnected')
        reject(error)
        try {
          socket.close()
        } catch {
          // 非互換socketのclose失敗でhandshake errorを置き換えてはならない。
        }
      }

      socket.addEventListener('open', () => {
        if (!this.#shouldReconnect || this.#socket !== socket) {
          socket.close()
          return
        }
        handshakeTimer = setTimeout(() => {
          rejectHandshake(
            new Error('Loutre DevTools protocol handshake timed out.'),
          )
        }, 5_000)
      })
      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return
        if (!protocolAccepted) {
          const version = protocolVersionFromHello(event.data)
          if (version === undefined) {
            rejectHandshake(
              new Error('Invalid Loutre DevTools protocol hello.'),
            )
            return
          }
          if (version !== DEVTOOLS_PROTOCOL_VERSION) {
            rejectHandshake(
              new Error(
                `Unsupported Loutre DevTools protocol version: ${version}. Expected ${DEVTOOLS_PROTOCOL_VERSION}.`,
              ),
            )
            return
          }
          protocolAccepted = true
          settled = true
          if (handshakeTimer !== undefined) clearTimeout(handshakeTimer)
          this.#reconnectAttempt = 0
          this.#setStatus('connected')
          resolve()
          return
        }
        this.#handleMessage(event.data)
      })
      socket.addEventListener('error', () => {
        if (settled) return
        if (handshakeTimer !== undefined) clearTimeout(handshakeTimer)
        if (this.#socket === socket) this.#socket = undefined
        reject(new Error('Could not connect to Loutre DevTools.'))
        try {
          socket.close()
        } catch {
          // 接続途中のclose失敗でconnection errorを置き換えてはならない。
        }
      })
      socket.addEventListener('close', () => {
        if (handshakeTimer !== undefined) clearTimeout(handshakeTimer)
        if (this.#socket === socket) this.#socket = undefined
        if (!settled) reject(new Error('Could not connect to Loutre DevTools.'))
        this.#failPending(new Error('Loutre DevTools connection closed.'))
        if (this.#shouldReconnect) this.#scheduleReconnect()
        else this.#setStatus('disconnected')
      })
    }).finally(() => {
      if (this.#connectPromise === promise) this.#connectPromise = undefined
    })

    this.#connectPromise = promise
    void promise.catch(() => {
      if (this.#shouldReconnect) this.#scheduleReconnect()
    })
    return promise
  }

  #scheduleReconnect(): void {
    if (!this.#shouldReconnect || this.#reconnectTimer !== undefined) return
    this.#setStatus('reconnecting')
    const delay = Math.min(250 * 2 ** this.#reconnectAttempt, 5_000)
    this.#reconnectAttempt += 1
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined
      if (!this.#shouldReconnect) return
      void this.#openSocket(true).catch(() => {
        // 再接続が有効な間は#openSocket側で次のretryを予約する。
      })
    }, delay)
  }

  #setStatus(status: DevtoolsConnectionStatus): void {
    if (this.#status === status) return
    this.#status = status
    for (const listener of this.#connectionListeners) listener(status)
  }

  #failPending(error: Error): void {
    for (const pending of this.#pending.values()) pending.reject(error)
    this.#pending.clear()
  }

  #handleMessage(raw: string): void {
    let message: unknown
    try {
      message = JSON.parse(raw)
    } catch {
      return
    }
    if (!isRecord(message)) return
    if (message.type === 'event') {
      if (
        (message.event === 'graph.state' ||
          message.event === 'runtime.batch' ||
          message.event === 'runtime.snapshot') &&
        'payload' in message
      ) {
        const event = message as unknown as DevtoolsClientEvent
        for (const listener of this.#listeners) listener(event)
      }
      return
    }
    if (
      message.type !== 'response' ||
      typeof message.id !== 'string' ||
      typeof message.ok !== 'boolean'
    ) {
      return
    }
    const pending = this.#pending.get(message.id)
    if (!pending) return
    this.#pending.delete(message.id)
    if (message.ok) {
      pending.resolve(message.result)
      return
    }
    const error = message.error
    if (isRecord(error) && typeof error.message === 'string') {
      const next = new Error(error.message)
      if (typeof error.name === 'string') next.name = error.name
      pending.reject(next)
    } else {
      pending.reject(new Error('Loutre DevTools request failed.'))
    }
  }
}

function protocolVersionFromHello(raw: string): number | undefined {
  let message: unknown
  try {
    message = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (
    !isRecord(message) ||
    message.type !== 'hello' ||
    typeof message.protocolVersion !== 'number'
  ) {
    return undefined
  }
  return message.protocolVersion
}

function clientFor(baseUrl: string): DevtoolsClient {
  const normalized = normalizeDevtoolsBaseUrl(baseUrl)
  const current = clients.get(normalized)
  if (current) return current
  const client = new DevtoolsClient(normalized)
  clients.set(normalized, client)
  return client
}

function controlEndpoint(baseUrl: string): string {
  const url = new URL(normalizeDevtoolsBaseUrl(baseUrl))
  url.protocol = 'ws:'
  url.pathname = '/__loutre/client'
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function normalizeDevtoolsBaseUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') {
    throw new Error('Invalid local DevTools URL.')
  }
  return url.origin
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
