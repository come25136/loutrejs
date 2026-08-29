import { bootstrap } from '@loutrejs/loutre/host'
import { expect, it } from 'vitest'
import application from './app.js'

it('GET / returns a response from the Loutre Application', async () => {
  const app = bootstrap({ application })
  try {
    const response = await app.fetch(new Request('http://localhost/'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: 'Hello from Loutre!' })
  } finally {
    await app.close('test-complete')
  }
})
