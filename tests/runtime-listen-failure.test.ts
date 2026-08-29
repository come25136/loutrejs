import { createServer } from 'node:http'
import { defineApplication } from '@loutrejs/loutre'
import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import { denoRuntime } from '@loutrejs/loutre/runtime/deno'
import { nodeRuntime } from '@loutrejs/node'
import { UsersModule } from '../fixtures/http-crud/src/index.js'
import { silentLogger } from './helpers/silent-logger.js'

const usersDefinition = () =>
  defineApplication({ modules: [UsersModule()], logger: silentLogger })

describe('runtime listen failure', () => {
  it('Nodeは使用中portへのlistenをEADDRINUSEでrejectする', async () => {
    const occupied = createServer()
    await new Promise<void>((resolve, reject) => {
      occupied.once('error', reject)
      occupied.listen(0, '127.0.0.1', () => resolve())
    })
    const address = occupied.address()
    if (!address || typeof address === 'string') {
      throw new Error('test serverのportを取得できませんでした')
    }

    try {
      await expect(
        nodeRuntime.serve({
          application: usersDefinition(),
          hostname: '127.0.0.1',
          port: address.port,
        }),
      ).rejects.toMatchObject({ code: 'EADDRINUSE' })
    } finally {
      await new Promise<void>((resolve, reject) =>
        occupied.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })

  it('Bunはlisten失敗をserve()からrejectする', async () => {
    vi.stubGlobal('Bun', {
      env: {},
      serve: () => {
        throw addressInUseError()
      },
    })

    try {
      await expect(
        bunRuntime.serve({
          application: usersDefinition(),
          hostname: '127.0.0.1',
          port: 3000,
        }),
      ).rejects.toMatchObject({ code: 'EADDRINUSE' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('Denoはlisten失敗をserve()からrejectする', async () => {
    vi.stubGlobal('Deno', {
      env: { toObject: () => ({}) },
      serve: () => {
        throw addressInUseError()
      },
    })

    try {
      await expect(
        denoRuntime.serve({
          application: usersDefinition(),
          hostname: '127.0.0.1',
          port: 3000,
        }),
      ).rejects.toMatchObject({ code: 'EADDRINUSE' })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

function addressInUseError(): Error & { code: string } {
  return Object.assign(new Error('Address already in use'), {
    code: 'EADDRINUSE',
  })
}
