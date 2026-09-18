import type { IncomingMessage } from 'node:http'

export function isDevtoolsLoopbackRequest(request: IncomingMessage): boolean {
  const host = request.headers.host
  if (!host) return false
  try {
    if (new URL(`http://${host}`).hostname !== '127.0.0.1') return false
  } catch {
    return false
  }
  return (
    request.socket.remoteAddress === '127.0.0.1' ||
    request.socket.remoteAddress === '::ffff:127.0.0.1'
  )
}
