import {
  runtimeCapability,
  type RuntimeCapabilityBinding,
} from '../core/index.js'
import { type WebSocketServerDriver } from './contract.js'

export const WEBSOCKET_SERVER =
  runtimeCapability<WebSocketServerDriver>('websocket.server')

export function bindWebSocketServer(
  driver: WebSocketServerDriver,
): RuntimeCapabilityBinding<WebSocketServerDriver> {
  return { capability: WEBSOCKET_SERVER, value: driver }
}
