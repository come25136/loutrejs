import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import type { HttpProtocolExecution } from '@loutrejs/http'
import { createLambdaHttpDriver } from '@loutrejs/runtime-lambda'
import { createNodeHttpServerDriver } from '@loutrejs/runtime-node'

describe('複数値HTTP response header', () => {
  it('Node adapterが複数のSet-Cookieを別々に保持する', async () => {
    const application = cookieApplication()
    const server = createNodeHttpServerDriver(application)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')

    try {
      const { port } = server.address() as AddressInfo
      const response = await fetch(`http://127.0.0.1:${port}/cookies`)

      expect(response.headers.getSetCookie()).toEqual([
        'first=one; Path=/',
        'second=two; Path=/',
      ])
    } finally {
      server.close()
      await once(server, 'close')
    }
  })

  it('Lambda adapterがSet-Cookieをcookiesへ分離する', async () => {
    const handler = createLambdaHttpDriver(cookieApplication())
    const result = await handler({ rawPath: '/cookies' })

    expect(result.cookies).toEqual(['first=one; Path=/', 'second=two; Path=/'])
    expect(result.headers).not.toHaveProperty('set-cookie')
  })
})

function cookieApplication(): HttpProtocolExecution {
  return {
    graph: {} as HttpProtocolExecution['graph'],
    initialize: async () => undefined,
    shutdown: async () => undefined,
    onServerListening: () => undefined,
    handle: async () => {
      const headers = new Headers()
      headers.append('set-cookie', 'first=one; Path=/')
      headers.append('set-cookie', 'second=two; Path=/')
      return new Response('ok', { headers })
    },
  } as unknown as HttpProtocolExecution
}
