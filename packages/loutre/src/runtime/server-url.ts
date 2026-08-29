export function serverUrl(hostname: string | undefined, port: number): string {
  const host = hostname ?? 'localhost'
  const formattedHost = host.includes(':') ? `[${host}]` : host
  return `http://${formattedHost}:${port}`
}
