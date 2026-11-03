import type { Brand } from '../internal/brand.js'
export type WebSocketSessionId = Brand<string, 'websocket.session-id'>
export type WebSocketProcedureName = Brand<string, 'websocket.procedure'>
export type NegotiatedSubprotocol = Brand<
  string,
  'websocket.negotiated-subprotocol'
>
export type ObservedCloseCode = Brand<number, 'websocket.observed-close-code'>
export const createWebSocketSessionId = (): WebSocketSessionId =>
  `ws_${crypto.randomUUID()}` as WebSocketSessionId
export const webSocketProcedureName = (value: string): WebSocketProcedureName =>
  value as WebSocketProcedureName
export const negotiatedSubprotocol = (value: string): NegotiatedSubprotocol =>
  value as NegotiatedSubprotocol
export const observedCloseCode = (value: number): ObservedCloseCode =>
  value as ObservedCloseCode
