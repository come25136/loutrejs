/** WebSocketへのUpgrade要求かを判定する。handshake全体の検証は行わない。 */
export function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get('upgrade')?.toLowerCase() === 'websocket'
}
