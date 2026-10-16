import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import { Server } from 'node:http'
import { defineApplication, defineModule } from '@loutrejs/loutre'
import { Logger, type LogRecord } from '@loutrejs/loutre/runtime'
import { nodeRuntime } from '@loutrejs/node'
import { silentLogger } from './helpers/silent-logger.js'

const signals = ['SIGINT', 'SIGTERM'] as const
const listeners = (): readonly (readonly unknown[])[] =>
  signals.map((signal) => process.rawListeners(signal))
const counts = () => signals.map((signal) => process.listenerCount(signal))

function worker(onShutdown: (signal?: string) => void | Promise<void>) {
  class Resource {
    onApplicationShutdown(signal?: string) {
      return onShutdown(signal)
    }
  }
  return defineApplication({
    modules: [defineModule(() => ({ providers: [Resource] }))()],
    logger: silentLogger,
  })
}

describe('Node workerの終了フック', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => vi.restoreAllMocks())

  it.each(signals)(
    'HTTPなしで%sをlifecycleへ渡し、二重終了を防ぐ',
    async (signal) => {
      const baseline = listeners()
      const baselineCounts = counts()
      const shutdown = vi.fn()
      const app = await nodeRuntime.create({ application: worker(shutdown) })
      try {
        expect(counts()).toEqual(baselineCounts.map((count) => count + 1))
        const index = signals.indexOf(signal)
        const handler = process
          .rawListeners(signal)
          .find((candidate) => !baseline[index]!.includes(candidate))!
        Reflect.apply(handler, process, [signal])
        await app.close()
        expect(shutdown).toHaveBeenCalledExactlyOnceWith(signal)
        expect(counts()).toEqual(baselineCounts)
      } finally {
        await app.close()
      }
    },
  )

  it('複数Applicationの手動closeで自分のhandlerだけを解除する', async () => {
    const baseline = counts()
    const first = await nodeRuntime.create({ application: worker(() => {}) })
    const second = await nodeRuntime.create({ application: worker(() => {}) })
    try {
      expect(counts()).toEqual(baseline.map((count) => count + 2))
      await first.close()
      expect(counts()).toEqual(baseline.map((count) => count + 1))
    } finally {
      await Promise.all([first.close(), second.close()])
    }
    expect(counts()).toEqual(baseline)
  })

  it('createで無効にした終了フックはserveの省略時にも無効のまま', async () => {
    const baseline = counts()
    const app = await nodeRuntime.create({
      application: worker(() => {}),
      shutdownHooks: false,
    })
    try {
      expect(counts()).toEqual(baseline)
      await app.serve({ port: 0 })
      expect(counts()).toEqual(baseline)
    } finally {
      await app.close()
    }
  })

  it('serve後もhandlerを重複させずsignalでlistenerも閉じる', async () => {
    const baseline = listeners()
    const baselineCounts = counts()
    const shutdown = vi.fn()
    const app = await nodeRuntime.create({ application: worker(shutdown) })
    try {
      const listener = await app.serve({ port: 0, shutdownHooks: true })
      expect(counts()).toEqual(baselineCounts.map((count) => count + 1))
      const handler = process
        .rawListeners('SIGTERM')
        .find((candidate) => !baseline[1]!.includes(candidate))!
      Reflect.apply(handler, process, ['SIGTERM'])
      await app.close()
      expect(listener.server.listening).toBe(false)
      expect(shutdown).toHaveBeenCalledExactlyOnceWith('SIGTERM')
      expect(counts()).toEqual(baselineCounts)
    } finally {
      await app.close()
    }
  })

  it('listen完了前のsignalでもserverを閉じ、shutdown hookを再登録しない', async () => {
    const baseline = listeners()
    const baselineCounts = counts()
    const shutdown = vi.fn()
    const app = await nodeRuntime.create({ application: worker(shutdown) })
    const servers: Server[] = []
    const listen = Server.prototype.listen
    vi.spyOn(Server.prototype, 'listen').mockImplementation(function (
      this: Server,
      ...args
    ) {
      servers.push(this)
      setTimeout(() => Reflect.apply(listen, this, args), 10)
      return this
    })
    try {
      const serving = app.serve({ port: 0 })
      const handler = process
        .rawListeners('SIGTERM')
        .find((candidate) => !baseline[1]!.includes(candidate))!
      Reflect.apply(handler, process, ['SIGTERM'])
      await expect(serving).rejects.toThrow('LUTRE_APP_STOPPED')
      expect(servers[0]?.listening).toBe(false)
      expect(shutdown).toHaveBeenCalledExactlyOnceWith('SIGTERM')
      expect(counts()).toEqual(baselineCounts)
    } finally {
      await app.close()
    }
  })

  it('signalによる終了失敗をLoggerで観測し、handlerを解除する', async () => {
    const baseline = listeners()
    const baselineCounts = counts()
    const records: LogRecord[] = []
    const error = new Error('shutdown failed')
    const definition = worker(() => {
      throw error
    })
    const app = await nodeRuntime.create({
      application: {
        ...definition,
        logger: new Logger({ write: (record) => records.push(record) }),
      },
    })
    try {
      const handler = process
        .rawListeners('SIGINT')
        .find((candidate) => !baseline[0]!.includes(candidate))!
      Reflect.apply(handler, process, ['SIGINT'])
      await expect(app.close()).rejects.toThrow('Node runtime shutdown failed')
      await vi.waitFor(() =>
        expect(records).toContainEqual(
          expect.objectContaining({
            level: 'error',
            message: 'Node runtime shutdown failed',
            signal: 'SIGINT',
            error: expect.any(AggregateError),
          }),
        ),
      )
      expect(counts()).toEqual(baselineCounts)
    } finally {
      await app.close()
    }
  })
})

describe('Bun workerの終了フック', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('Bun', {
      env: {},
      version: '1.4.0',
      serve: () => ({ port: 43210, stop: () => {} }),
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each(signals)(
    'HTTPなしで%sをlifecycleへ渡し、handlerを解除する',
    async (signal) => {
      const baseline = listeners()
      const baselineCounts = counts()
      const shutdown = vi.fn()
      const app = await bunRuntime.create({ application: worker(shutdown) })
      try {
        const index = signals.indexOf(signal)
        const handler = process
          .rawListeners(signal)
          .find((candidate) => !baseline[index]!.includes(candidate))!
        Reflect.apply(handler, process, [signal])
        await app.close()
        expect(shutdown).toHaveBeenCalledExactlyOnceWith(signal)
        expect(counts()).toEqual(baselineCounts)
      } finally {
        await app.close()
      }
    },
  )

  it('createで無効にした終了フックをserveでも維持し、明示指定で有効にできる', async () => {
    const baseline = counts()
    const first = await bunRuntime.create({
      application: worker(() => {}),
      shutdownHooks: false,
    })
    const second = await bunRuntime.create({
      application: worker(() => {}),
      shutdownHooks: false,
    })
    try {
      await first.serve({ port: 0 })
      expect(counts()).toEqual(baseline)
      await second.serve({ port: 0, shutdownHooks: true })
      expect(counts()).toEqual(baseline.map((count) => count + 1))
    } finally {
      await Promise.all([first.close(), second.close()])
    }
    expect(counts()).toEqual(baseline)
  })
})
