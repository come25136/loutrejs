import { bootstrapApplication } from '@loutrejs/loutre'
import { bindHttpServer } from '@loutrejs/loutre/http'
import { expect, it } from 'vitest'
import application from './app.js'

it('GET / returns a response from the Loutre Application', async () => {
  const app = await bootstrapApplication({
    application,
    capabilities: [bindHttpServer({ runtime: 'test' })],
  })
  try {
    const response = await app.http.fetch(new Request('http://localhost/'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: 'Hello from Loutre!' })
  } finally {
    await app.close('test-complete')
  }
})
