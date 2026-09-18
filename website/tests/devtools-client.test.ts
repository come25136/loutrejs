import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  connectDevtools,
  devtoolsRequest,
  disconnectDevtools,
  subscribeDevtoolsConnection,
  subscribeDevtoolsEvents,
  type DevtoolsConnectionStatus,
} from '../lib/devtools-client.js'
import { DEVTOOLS_PROTOCOL_VERSION } from '../lib/devtools-protocol.js'
import { subscribeRuntimeEvents } from '../lib/devtools-runtime.js'

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static readonly instances: FakeWebSocket[] = []

  readonly url: string
  readonly sent: string[] = []
  readyState = FakeWebSocket.CONNECTING

  constructor(url: string | URL) {
    super()
    this.url = String(url)
    FakeWebSocket.instances.push(this)
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  serverClose(): void {
    this.readyState = FakeWebSocket.CLOSED
    this.dispatchEvent(new Event('close'))
  }

  serverMessage(value: unknown): void {
    this.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(value) }),
    )
  }

  send(value: string): void {
    this.sent.push(value)
  }

  close(): void {
    if (this.readyState === FakeWebSocket.CLOSED) return
    this.readyState = FakeWebSocket.CLOSED
    this.dispatchEvent(new Event('close'))
  }
}

const originalWebSocket = globalThis.WebSocket

beforeEach(() => {
  FakeWebSocket.instances.length = 0
  vi.useFakeTimers()
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
})

afterEach(() => {
  disconnectDevtools('http://127.0.0.1:25137')
  disconnectDevtools('http://127.0.0.1:25138')
  disconnectDevtools('http://127.0.0.1:25139')
  disconnectDevtools('http://127.0.0.1:25140')
  globalThis.WebSocket = originalWebSocket
  vi.useRealTimers()
})

describe('DevTools control connection', () => {
  it('切断後にbackoffして同じclientを自動再接続する', async () => {
    const baseUrl = 'http://127.0.0.1:25137'
    const statuses: DevtoolsConnectionStatus[] = []
    const unsubscribe = subscribeDevtoolsConnection(baseUrl, (status) => {
      statuses.push(status)
    })

    const initial = connectDevtools(baseUrl)
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(statuses).toEqual(['disconnected', 'connecting'])

    FakeWebSocket.instances[0]!.open()
    FakeWebSocket.instances[0]!.serverMessage({
      type: 'hello',
      protocolVersion: DEVTOOLS_PROTOCOL_VERSION,
    })
    await initial
    expect(statuses.at(-1)).toBe('connected')

    FakeWebSocket.instances[0]!.serverClose()
    expect(statuses.at(-1)).toBe('reconnecting')

    await vi.advanceTimersByTimeAsync(249)
    expect(FakeWebSocket.instances).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(FakeWebSocket.instances).toHaveLength(2)

    FakeWebSocket.instances[1]!.open()
    FakeWebSocket.instances[1]!.serverMessage({
      type: 'hello',
      protocolVersion: DEVTOOLS_PROTOCOL_VERSION,
    })
    await vi.runAllTicks()
    expect(statuses.at(-1)).toBe('connected')

    unsubscribe()
  })

  it('runtime.snapshotをcontrol listenerとruntime subscriberへ伝播する', async () => {
    const baseUrl = 'http://127.0.0.1:25139'
    const controlEvents: string[] = []
    const runtimeEvents: string[] = []
    const unsubscribeControl = subscribeDevtoolsEvents(baseUrl, (event) => {
      controlEvents.push(event.event)
    })
    const unsubscribeRuntime = subscribeRuntimeEvents(baseUrl, (event) => {
      runtimeEvents.push(event.event)
    })

    const initial = connectDevtools(baseUrl)
    FakeWebSocket.instances[0]!.open()
    FakeWebSocket.instances[0]!.serverMessage({
      type: 'hello',
      protocolVersion: DEVTOOLS_PROTOCOL_VERSION,
    })
    await initial
    FakeWebSocket.instances[0]!.serverMessage({
      type: 'event',
      event: 'runtime.snapshot',
      payload: [],
    })

    expect(controlEvents).toEqual(['runtime.snapshot'])
    expect(runtimeEvents).toEqual(['runtime.snapshot'])
    unsubscribeRuntime()
    unsubscribeControl()
  })

  it('protocol hello完了前のOPEN socketを別requestへ公開しない', async () => {
    const baseUrl = 'http://127.0.0.1:25140'
    const statuses: DevtoolsConnectionStatus[] = []
    const unsubscribe = subscribeDevtoolsConnection(baseUrl, (status) => {
      statuses.push(status)
    })
    const initial = connectDevtools(baseUrl)
    const socket = FakeWebSocket.instances[0]!
    socket.open()

    const request = devtoolsRequest(baseUrl, 'graph.get')
    await Promise.resolve()
    expect(statuses.at(-1)).toBe('connecting')
    expect(socket.sent).toEqual([])

    socket.serverMessage({
      type: 'hello',
      protocolVersion: DEVTOOLS_PROTOCOL_VERSION,
    })
    await initial
    await Promise.resolve()
    expect(statuses.at(-1)).toBe('connected')
    expect(socket.sent).toHaveLength(1)

    const sent = JSON.parse(socket.sent[0]!) as { id: string }
    socket.serverMessage({
      type: 'response',
      id: sent.id,
      ok: true,
      result: { revision: 1 },
    })
    await expect(request).resolves.toEqual({ revision: 1 })
    unsubscribe()
  })

  it('互換性のないprotocol versionはconnectedにせず再接続もしない', async () => {
    const baseUrl = 'http://127.0.0.1:25138'
    const statuses: DevtoolsConnectionStatus[] = []
    const unsubscribe = subscribeDevtoolsConnection(baseUrl, (status) => {
      statuses.push(status)
    })
    const initial = connectDevtools(baseUrl)
    FakeWebSocket.instances[0]!.open()
    FakeWebSocket.instances[0]!.serverMessage({
      type: 'hello',
      protocolVersion: DEVTOOLS_PROTOCOL_VERSION + 1,
    })

    await expect(initial).rejects.toThrow(
      'Unsupported Loutre DevTools protocol version',
    )
    expect(statuses.at(-1)).toBe('disconnected')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
    unsubscribe()
  })

  it('clientを明示破棄すると予約済みreconnectを止める', async () => {
    const baseUrl = 'http://127.0.0.1:25138'
    const initial = connectDevtools(baseUrl)
    FakeWebSocket.instances[0]!.open()
    FakeWebSocket.instances[0]!.serverMessage({
      type: 'hello',
      protocolVersion: DEVTOOLS_PROTOCOL_VERSION,
    })
    await initial

    FakeWebSocket.instances[0]!.serverClose()
    disconnectDevtools(baseUrl)
    await vi.advanceTimersByTimeAsync(5_000)

    expect(FakeWebSocket.instances).toHaveLength(1)
  })
})
