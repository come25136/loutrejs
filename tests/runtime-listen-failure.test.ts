import { createServer, type Server } from 'node:http'
import { defineApplication } from '@loutrejs/loutre'
import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import { denoRuntime } from '@loutrejs/loutre/runtime/deno'
import { nodeRuntime } from '@loutrejs/node'
import { UsersModule } from '../fixtures/http-crud/src/index.js'
import { silentLogger } from './helpers/silent-logger.js'

const usersDefinition = () =>
  defineApplication({ modules: [UsersModule()], logger: silentLogger })

describe('runtime listen failure', () => {
  it('Nodeは明示portが使用中ならEADDRINUSEでrejectする', async () => {
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
      await closeServer(occupied)
    }
  })

  it('Nodeはport省略時に3000が使用中なら次の空きportへlistenする', async () => {
    const occupied = await occupyPortIfAvailable(3000)
    let runtime: Awaited<ReturnType<typeof nodeRuntime.serve>> | undefined

    try {
      runtime = await nodeRuntime.serve({
        application: usersDefinition(),
        hostname: '127.0.0.1',
      })

      expect(runtime.port).toBeGreaterThan(3000)
      expect(runtime.server.address()).toMatchObject({ port: runtime.port })
    } finally {
      await runtime?.close('test-complete')
      if (occupied) await closeServer(occupied)
    }
  })

  it('Bunは明示portのlisten失敗を再試行せずserve()からrejectする', async () => {
    const ports: number[] = []
    vi.stubGlobal('Bun', {
      env: {},
      serve: ({ port }: { readonly port: number }) => {
        ports.push(port)
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
      expect(ports).toEqual([3000])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('Bunはport省略時にEADDRINUSEごとにportをincrementする', async () => {
    const ports: number[] = []
    vi.stubGlobal('Bun', {
      env: {},
      serve: ({ port }: { readonly port: number }) => {
        ports.push(port)
        if (port < 3002) throw addressInUseError()
        return { stop: () => undefined }
      },
    })

    let runtime: Awaited<ReturnType<typeof bunRuntime.serve>> | undefined
    try {
      runtime = await bunRuntime.serve({
        application: usersDefinition(),
        hostname: '127.0.0.1',
      })
      expect(ports).toEqual([3000, 3001, 3002])
      expect(runtime.port).toBe(3002)
    } finally {
      await runtime?.close('test-complete')
      vi.unstubAllGlobals()
    }
  })

  it('Denoは明示portのlisten失敗を再試行せずserve()からrejectする', async () => {
    const ports: number[] = []
    vi.stubGlobal('Deno', {
      env: { toObject: () => ({}) },
      serve: ({ port }: { readonly port: number }) => {
        ports.push(port)
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
      expect(ports).toEqual([3000])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('Denoはport省略時にEADDRINUSEごとにportをincrementする', async () => {
    const ports: number[] = []
    vi.stubGlobal('Deno', {
      env: { toObject: () => ({}) },
      serve: ({ port }: { readonly port: number }) => {
        ports.push(port)
        if (port < 3002) throw addressInUseError()
        return { shutdown: async () => undefined }
      },
    })

    let runtime: Awaited<ReturnType<typeof denoRuntime.serve>> | undefined
    try {
      runtime = await denoRuntime.serve({
        application: usersDefinition(),
        hostname: '127.0.0.1',
      })
      expect(ports).toEqual([3000, 3001, 3002])
      expect(runtime.port).toBe(3002)
    } finally {
      await runtime?.close('test-complete')
      vi.unstubAllGlobals()
    }
  })
})

async function occupyPortIfAvailable(
  port: number,
): Promise<Server | undefined> {
  const server = createServer()
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => resolve())
    })
    return server
  } catch (error) {
    server.close()
    if (isAddressInUseError(error)) return undefined
    throw error
  }
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
}

function isAddressInUseError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'EADDRINUSE'
  )
}

function addressInUseError(): Error & { code: string } {
  return Object.assign(new Error('Address already in use'), {
    code: 'EADDRINUSE',
  })
}
