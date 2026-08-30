import { createServer, type Server } from 'node:http'
import { defineApplication } from '@loutrejs/loutre'
import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import { denoRuntime } from '@loutrejs/loutre/runtime/deno'
import { nodeRuntime } from '@loutrejs/node'
import { UsersModule } from '../integrations/http-crud/src/index.js'
import { silentLogger } from './helpers/silent-logger.js'

const usersDefinition = () =>
  defineApplication({ modules: [UsersModule()], logger: silentLogger })

describe('runtime listen failure', () => {
  let startupOutput: string[]

  beforeEach(() => {
    startupOutput = []
    vi.spyOn(console, 'log').mockImplementation((value) => {
      startupOutput.push(String(value))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('Nodeは明示portが使用中ならpreludeだけを出してEADDRINUSEでrejectする', async () => {
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
      const app = await nodeRuntime.create({ application: usersDefinition() })
      await expect(
        app.serve({ hostname: '127.0.0.1', port: address.port }),
      ).rejects.toMatchObject({ code: 'EADDRINUSE' })
      expect(startupOutput).toHaveLength(1)
      expect(startupOutput[0]).toMatch(/^Loutre /u)
      expect(startupOutput.join('\n')).not.toContain('Ready')
    } finally {
      await closeServer(occupied)
    }
  })

  it('Nodeはport省略時に3000が使用中なら次の空きportへlistenする', async () => {
    const signalListeners = currentProcessSignalListenerCounts()
    const occupied = await Promise.all([
      occupyPortIfAvailable(3000),
      occupyPortIfAvailable(3001),
    ])
    const app = await nodeRuntime.create({ application: usersDefinition() })

    try {
      const listener = await app.serve({ hostname: '127.0.0.1' })

      expect(listener.port).toBeGreaterThanOrEqual(3002)
      expect(listener.server.address()).toMatchObject({ port: listener.port })
      expect(startupOutput.join('\n')).toContain(
        `Server: http://127.0.0.1:${listener.port}`,
      )
      expect(startupOutput.join('\n')).toContain(
        `Runtime: Node.js ${process.versions.node}`,
      )
      expect(startupOutput.join('\n')).toContain(
        `Environment: ${process.env.NODE_ENV ?? 'development'}`,
      )
      expect(startupOutput.join('\n')).toContain('Ready in')
      expectProcessSignalListeners(signalListeners, 1)
    } finally {
      await app.close('test-complete')
      expectProcessSignalListeners(signalListeners, 0)
      await Promise.all(
        occupied.map((server) =>
          server ? closeServer(server) : Promise.resolve(),
        ),
      )
    }
  })

  it('NodeはshutdownHooksをfalseにするとsignal listenerを登録しない', async () => {
    const signalListeners = currentProcessSignalListenerCounts()
    const app = await nodeRuntime.create({ application: usersDefinition() })

    try {
      await app.serve({
        hostname: '127.0.0.1',
        shutdownHooks: false,
      })
      expectProcessSignalListeners(signalListeners, 0)
    } finally {
      await app.close('test-complete')
    }
  })

  it('Bunは明示portのlisten失敗を再試行せずserve()からrejectする', async () => {
    const ports: number[] = []
    vi.stubGlobal('Bun', {
      env: { NODE_ENV: 'test' },
      version: '1.2.3',
      serve: ({ port }: { readonly port: number }) => {
        ports.push(port)
        throw addressInUseError()
      },
    })

    const app = await bunRuntime.create({ application: usersDefinition() })
    await expect(
      app.serve({ hostname: '127.0.0.1', port: 3000 }),
    ).rejects.toMatchObject({ code: 'EADDRINUSE' })
    expect(ports).toEqual([3000])
    expect(startupOutput).toHaveLength(1)
    expect(startupOutput.join('\n')).not.toContain('Ready')
  })

  it('Bunはport省略時にEADDRINUSEごとにportをincrementする', async () => {
    const signalListeners = currentProcessSignalListenerCounts()
    const ports: number[] = []
    vi.stubGlobal('Bun', {
      env: { NODE_ENV: 'test' },
      version: '1.2.3',
      serve: ({ port }: { readonly port: number }) => {
        ports.push(port)
        if (port < 3002) throw addressInUseError()
        return { stop: () => undefined }
      },
    })

    const app = await bunRuntime.create({ application: usersDefinition() })
    try {
      const listener = await app.serve({ hostname: '127.0.0.1' })
      expect(ports).toEqual([3000, 3001, 3002])
      expect(listener.port).toBe(3002)
      expect(startupOutput.join('\n')).toContain(
        'Server: http://127.0.0.1:3002',
      )
      expect(startupOutput.join('\n')).toContain('Runtime: Bun 1.2.3')
      expect(startupOutput.join('\n')).toContain('Environment: test')
      expectProcessSignalListeners(signalListeners, 1)
    } finally {
      await app.close('test-complete')
      expectProcessSignalListeners(signalListeners, 0)
    }
  })

  it('BunはshutdownHooksをfalseにするとsignal listenerを登録しない', async () => {
    const signalListeners = currentProcessSignalListenerCounts()
    vi.stubGlobal('Bun', {
      env: { NODE_ENV: 'test' },
      version: '1.2.3',
      serve: () => ({ stop: () => undefined }),
    })

    const app = await bunRuntime.create({ application: usersDefinition() })
    try {
      await app.serve({ hostname: '127.0.0.1', shutdownHooks: false })
      expectProcessSignalListeners(signalListeners, 0)
    } finally {
      await app.close('test-complete')
    }
  })

  it('Denoは明示portのlisten失敗を再試行せずserve()からrejectする', async () => {
    const ports: number[] = []
    vi.stubGlobal('Deno', {
      env: { get: () => undefined, toObject: () => ({}) },
      version: { deno: '2.5.0' },
      serve: ({ port }: { readonly port: number }) => {
        ports.push(port)
        throw addressInUseError()
      },
    })

    const app = await denoRuntime.create({ application: usersDefinition() })
    await expect(
      app.serve({ hostname: '127.0.0.1', port: 3000 }),
    ).rejects.toMatchObject({ code: 'EADDRINUSE' })
    expect(ports).toEqual([3000])
    expect(startupOutput).toHaveLength(1)
    expect(startupOutput.join('\n')).not.toContain('Ready')
  })

  it('Denoはport省略時にEADDRINUSEごとにportをincrementする', async () => {
    const ports: number[] = []
    const signalListeners = new Map<string, () => void>()
    vi.stubGlobal('Deno', {
      env: {
        get: (name: string) => (name === 'DENO_ENV' ? 'test' : undefined),
        toObject: () => ({ DENO_ENV: 'test' }),
      },
      version: { deno: '2.5.0' },
      addSignalListener: (signal: string, handler: () => void) => {
        signalListeners.set(signal, handler)
      },
      removeSignalListener: (signal: string, handler: () => void) => {
        if (signalListeners.get(signal) === handler)
          signalListeners.delete(signal)
      },
      serve: ({ port }: { readonly port: number }) => {
        ports.push(port)
        if (port < 3002) throw addressInUseError()
        return { shutdown: async () => undefined }
      },
    })

    const app = await denoRuntime.create({ application: usersDefinition() })
    try {
      const listener = await app.serve({ hostname: '127.0.0.1' })
      expect(ports).toEqual([3000, 3001, 3002])
      expect(listener.port).toBe(3002)
      expect(startupOutput.join('\n')).toContain(
        'Server: http://127.0.0.1:3002',
      )
      expect(startupOutput.join('\n')).toContain('Runtime: Deno 2.5.0')
      expect(startupOutput.join('\n')).toContain('Environment: test')
      expect([...signalListeners.keys()]).toEqual(['SIGINT', 'SIGTERM'])
    } finally {
      await app.close('test-complete')
      expect(signalListeners.size).toBe(0)
    }
  })

  it('DenoはshutdownHooksをfalseにするとsignal listenerを登録しない', async () => {
    const addSignalListener = vi.fn()
    const removeSignalListener = vi.fn()
    vi.stubGlobal('Deno', {
      env: { get: () => undefined, toObject: () => ({}) },
      version: { deno: '2.5.0' },
      addSignalListener,
      removeSignalListener,
      serve: () => ({ shutdown: async () => undefined }),
    })

    const app = await denoRuntime.create({ application: usersDefinition() })
    try {
      await app.serve({ hostname: '127.0.0.1', shutdownHooks: false })
      expect(addSignalListener).not.toHaveBeenCalled()
      expect(removeSignalListener).not.toHaveBeenCalled()
    } finally {
      await app.close('test-complete')
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

function currentProcessSignalListenerCounts(): Readonly<
  Record<'SIGINT' | 'SIGTERM', number>
> {
  return {
    SIGINT: process.listenerCount('SIGINT'),
    SIGTERM: process.listenerCount('SIGTERM'),
  }
}

function expectProcessSignalListeners(
  baseline: Readonly<Record<'SIGINT' | 'SIGTERM', number>>,
  additional: number,
): void {
  expect(process.listenerCount('SIGINT')).toBe(baseline.SIGINT + additional)
  expect(process.listenerCount('SIGTERM')).toBe(baseline.SIGTERM + additional)
}
