import { z } from 'zod'
import {
  bootstrapApplication,
  createKernelApplication,
  defineApplication,
  defineEnv,
  defineModule,
  hook,
  inject,
  provide,
  LoggerModule,
  LoggerService,
  LoggerToken,
} from '@loutrejs/loutre'
import { bindHttpServer, http } from '@loutrejs/loutre/http'
import {
  Logger,
  type LoggerBackend,
  type LogRecord,
} from '@loutrejs/loutre/runtime'

describe('ApplicationのLogger DI', () => {
  it('LoggerModuleが標準Loggerを公開し、backendをApplication内で共有してApplication間では分離する', async () => {
    class Consumer {
      readonly logger = inject(LoggerToken)
    }
    const definition = defineApplication({
      modules: [LoggerModule, defineModule({ providers: [Consumer] })],
    })
    expect(definition.model.diagnostics).toEqual([])
    const first = await bootstrapApplication({ application: definition })
    const second = await bootstrapApplication({ application: definition })
    try {
      const root = first.get(LoggerToken)
      const consumer = first.get(Consumer).logger
      expect(root).toBeInstanceOf(LoggerService)
      expect(LoggerService.name).toBe('LoggerService')
      expect(Logger).toBe(LoggerService)
      expect(root.context.source).toBe('Application')
      expect(consumer.context.source).toBe('Consumer')
      expect(consumer.backend).toBe(root.backend)
      expect(second.get(LoggerToken)).not.toBe(root)
      expect(second.get(LoggerToken).backend).not.toBe(root.backend)
      const implicit = defineApplication({ modules: [] }).model.providers
      expect(
        definition.model.providers.filter(
          (provider) => provider.provide !== Consumer,
        ),
      ).toEqual(implicit)
    } finally {
      await second.close()
      await first.close()
    }
  })

  it('Envに依存するbackendを初期化し、起動コード・Provider・middleware・Executionで共有する', async () => {
    const events: string[] = []
    class LogEnv extends defineEnv(z.object({ LABEL: z.string() })) {}
    class Backend implements LoggerBackend {
      readonly records: LogRecord[] = []
      ready = false
      readonly environment = inject(LogEnv)
      async onModuleInit() {
        await new Promise<void>((resolve) => setTimeout(resolve, 1))
        this.ready = true
        events.push('backend.init')
      }
      write(record: LogRecord) {
        expect(this.ready).toBe(true)
        this.records.push({ ...record, label: this.environment.LABEL })
      }
      async onApplicationDispose() {
        await new Promise<void>((resolve) => setTimeout(resolve, 1))
        events.push('backend.dispose')
        this.ready = false
      }
    }
    const ROOT = LoggerToken
    class CustomLoggerService extends Logger {
      constructor(backend = inject(Backend)) {
        super(backend)
      }
    }
    const Logging = defineModule({
      environment: [LogEnv],
      providers: [Backend, provide(LoggerToken).useClass(CustomLoggerService)],
      exports: [LoggerToken],
    })
    class Service {
      readonly logger = inject(Logger)
      onModuleInit() {
        this.logger.info('service.init')
      }
      onModuleDestroy() {
        this.logger.info('service.destroy')
      }
      beforeApplicationShutdown() {
        this.logger.info('service.before')
      }
      onApplicationShutdown() {
        this.logger.info('service.shutdown')
      }
      onApplicationDispose() {
        this.logger.info('service.dispose')
        events.push('service.dispose')
      }
    }
    const tracing = http.middleware({
      name: 'Tracing',
      factory:
        (logger = inject(Logger)) =>
        async (_context, next) => {
          logger.info('middleware')
          return next()
        },
    })
    const endpoint = http.implementation({
      name: 'Endpoint',
      contract: http.contract({
        health: {
          method: 'GET',
          path: '/',
          middlewares: [tracing],
          responses: { ok: { status: 204 } },
        },
      }),
      factory: (logger = inject(Logger)) => ({
        health(context) {
          logger.info('execution')
          return context.response.ok({})
        },
      }),
    })
    const App = defineModule({
      providers: [Service],
      executions: [endpoint],
      lifecycle: {
        onApplicationShutdown: hook({
          inject: [Logger],
          run: (logger) => logger.info('module.shutdown'),
        }),
      },
    })
    const definition = defineApplication({
      modules: [App, Logging],
    })
    expect(definition.model.diagnostics).toEqual([])
    const rootNode = definition.model.nodes.find(
      (node) => node.kind === 'provider' && node.token === LoggerToken,
    )!
    const backendNode = definition.model.nodes.find(
      (node) => node.kind === 'provider' && node.token === Backend,
    )!
    const serviceNode = definition.model.nodes.find(
      (node) => node.kind === 'provider' && node.token === Service,
    )!
    expect(definition.model.edges).toContainEqual({
      from: serviceNode.id,
      to: rootNode.id,
      kind: 'injects',
    })
    expect(definition.model.edges).toContainEqual({
      from: rootNode.id,
      to: backendNode.id,
      kind: 'injects',
    })
    const app = await bootstrapApplication({
      application: definition,
      environment: { LABEL: 'fixture' },
      capabilities: [bindHttpServer({ runtime: 'test' })],
    })
    const root = app.get(Logger)
    const backend = root.backend as Backend
    try {
      expect(root).toBe(app.get(ROOT))
      expect(app.get(Service).logger.backend).toBe(backend)
      root.info('startup')
      await app.http.fetch(new Request('http://test/'))
    } finally {
      await app.close()
    }
    expect(
      backend.records.map((record) => [
        record.message,
        record.source,
        record.label,
      ]),
    ).toEqual([
      ['service.init', 'Service', 'fixture'],
      ['startup', 'Application', 'fixture'],
      ['middleware', 'Tracing', 'fixture'],
      ['execution', 'Endpoint', 'fixture'],
      ['service.destroy', 'Service', 'fixture'],
      ['service.before', 'Service', 'fixture'],
      ['service.shutdown', 'Service', 'fixture'],
      [
        'module.shutdown',
        definition.model.nodes.find((node) => node.kind === 'lifecycle')!.id,
        'fixture',
      ],
      ['service.dispose', 'Service', 'fixture'],
    ])
    expect(events).toEqual([
      'backend.init',
      'service.dispose',
      'backend.dispose',
    ])
    await app.close()
    expect(events.filter((event) => event === 'backend.dispose')).toHaveLength(
      1,
    )
  })

  it('同じDefinitionから起動してもrootとbackendをApplication間で共有しない', async () => {
    const definition = defineApplication({ modules: [] })
    const first = await bootstrapApplication({ application: definition })
    const second = await bootstrapApplication({ application: definition })
    try {
      expect(first.get(Logger)).not.toBe(second.get(Logger))
      expect(first.get(Logger).backend).not.toBe(second.get(Logger).backend)
    } finally {
      await Promise.all([first.close(), second.close()])
    }
  })

  it('root構築途中の失敗でも先に生成した依存を逆順に回収し、cleanup失敗を元の例外へ併記する', async () => {
    const events: string[] = []
    const failure = new Error('root failed')
    const cleanupFailure = new Error('cleanup failed')
    class Connection {
      onModuleDestroy() {
        events.push('connection.destroy')
      }
      onApplicationDispose() {
        events.push('connection.dispose')
        throw cleanupFailure
      }
    }
    class Backend {
      readonly connection = inject(Connection)
      onModuleDestroy() {
        events.push('backend.destroy')
      }
      onApplicationDispose() {
        events.push('backend.dispose')
      }
    }
    const ROOT = LoggerToken
    const Logging = defineModule({
      providers: [
        Connection,
        Backend,
        provide(ROOT).useFactory({
          inject: [Backend],
          use: () => {
            throw failure
          },
        }),
      ],
      exports: [ROOT],
    })
    const app = createKernelApplication({
      application: defineApplication({ modules: [Logging] }),
    })
    await expect(app.init()).rejects.toMatchObject({
      errors: [failure, cleanupFailure],
      cause: failure,
    })
    expect(events).toEqual([
      'backend.destroy',
      'connection.destroy',
      'backend.dispose',
      'connection.dispose',
    ])
    await app.close()
    expect(events).toHaveLength(4)
  })

  it('依存の初期化失敗後にも生成済みbackendを回収する', async () => {
    const events: string[] = []
    const failure = new Error('backend init failed')
    class Backend implements LoggerBackend {
      write() {}
      onModuleInit() {
        throw failure
      }
      onApplicationDispose() {
        events.push('dispose')
      }
    }
    const ROOT = LoggerToken
    const Logging = defineModule({
      providers: [
        Backend,
        provide(ROOT).useFactory({
          inject: [Backend],
          use: (backend: Backend) => new Logger(backend),
        }),
      ],
      exports: [ROOT],
    })
    await expect(
      bootstrapApplication({
        application: defineApplication({ modules: [Logging] }),
      }),
    ).rejects.toBe(failure)
    expect(events).toEqual(['dispose'])
  })

  it('Logger準備前のEnvironment失敗ではrootを構築せず元のerrorを返す', async () => {
    class Environment extends defineEnv(z.object({ KEY: z.string() })) {}
    const ROOT = LoggerToken
    const construct = vi.fn(() => new Logger())
    const Logging = defineModule({
      environment: [Environment],
      providers: [provide(ROOT).useFactory({ use: construct })],
      exports: [ROOT],
    })
    const output = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(
        bootstrapApplication({
          application: defineApplication({ modules: [Logging] }),
          environment: {},
        }),
      ).rejects.toThrow()
      expect(construct).not.toHaveBeenCalled()
      expect(output).not.toHaveBeenCalled()
    } finally {
      output.mockRestore()
    }
  })

  it('backend終了後に保持したchildへ出した診断をconsoleへ送り、backendを再利用しない', async () => {
    const write = vi.fn()
    const dispose = vi.fn()
    const ROOT = LoggerToken
    class Backend implements LoggerBackend {
      write = write
      onApplicationDispose = dispose
    }
    const Logging = defineModule({
      providers: [
        Backend,
        provide(ROOT).useFactory({
          inject: [Backend],
          use: (backend: Backend) => new Logger(backend),
        }),
      ],
      exports: [ROOT],
    })
    const app = await bootstrapApplication({
      application: defineApplication({ modules: [Logging] }),
    })
    const logger = app.get(Logger).child({ source: 'Runtime' })
    const output = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await app.close()
      const failure = new Error('failure')
      failure.cause = failure
      logger.error('shutdown failed', {
        error: new AggregateError([failure], 'cleanup failed'),
      })
      expect(write).not.toHaveBeenCalled()
      expect(dispose).toHaveBeenCalledOnce()
      expect(JSON.parse(output.mock.calls[0]![0])).toMatchObject({
        level: 'error',
        source: 'Runtime',
        message: 'shutdown failed',
        error: {
          message: 'cleanup failed',
          errors: [{ message: 'failure', cause: '[Circular]' }],
        },
      })
    } finally {
      output.mockRestore()
    }
  })

  it('rootの依存からLoggerへの循環をModelで経路付きで診断する', () => {
    class Backend {
      readonly logger = inject(Logger)
    }
    const ROOT = LoggerToken
    const Logging = defineModule({
      providers: [
        Backend,
        provide(ROOT).useFactory({
          inject: [Backend],
          use: () => new Logger(),
        }),
      ],
      exports: [ROOT],
    })
    const definition = defineApplication({ modules: [Logging] })
    expect(definition.model.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'LUTRE_LOGGER_CYCLE',
        message: 'Circular Logger dependency: Logger -> Backend -> Logger',
      }),
    )
  })

  it('rootのscope・公開範囲・予約tokenへの登録をModelで検証する', () => {
    const ROOT = LoggerToken
    const privateRoot = defineModule({
      providers: [
        provide(ROOT).useFactory({
          scope: 'transient',
          use: () => new Logger(),
        }),
      ],
    })
    const model = defineApplication({
      modules: [privateRoot],
    }).model
    expect(model.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(['LUTRE_LOGGER_SCOPE', 'LUTRE_LOGGER_VISIBILITY']),
    )
    const duplicate = defineApplication({
      modules: [
        defineModule({
          providers: [
            provide(LoggerToken).useClass(Logger),
            provide(LoggerToken).useClass(Logger),
          ],
          exports: [LoggerToken],
        }),
      ],
    }).model
    expect(duplicate.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_PROVIDER_DUPLICATE' }),
    )
  })

  it('rootを再exportして選択してもbackendのModule visibilityを維持する', () => {
    class Backend {
      write() {}
    }
    const ROOT = LoggerToken
    const Logging = defineModule({
      providers: [
        Backend,
        provide(ROOT).useFactory({
          inject: [Backend],
          use: (backend: Backend) => new Logger(backend),
        }),
      ],
      exports: [ROOT],
    })
    const Root = defineModule({ imports: [Logging], exports: [ROOT] })
    expect(defineApplication({ modules: [Root] }).model.diagnostics).toEqual([])
    class Leaking {
      readonly backend = inject(Backend)
    }
    const Invalid = defineModule({
      imports: [Logging],
      providers: [Leaking],
      exports: [ROOT],
    })
    expect(
      defineApplication({ modules: [Invalid] }).model.diagnostics,
    ).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_MODULE_VISIBILITY' }),
    )
  })

  it('tokenでない設定とLoggerを返さないfactoryを明確に拒否する', async () => {
    const legacyOptions = {
      application: defineApplication({ modules: [] }),
      logger: new Logger(),
    }
    expect(() => createKernelApplication(legacyOptions)).toThrow(
      'LUTRE_LOGGER_CONFIGURATION',
    )
    const legacyDefinition = { modules: [], logger: new Logger() }
    expect(() => defineApplication(legacyDefinition)).toThrow(
      'LUTRE_LOGGER_CONFIGURATION',
    )
    const ROOT = LoggerToken
    const Logging = defineModule({
      providers: [provide(ROOT).useFactory({ use: () => ({}) as Logger })],
      exports: [ROOT],
    })
    await expect(
      bootstrapApplication({
        application: defineApplication({ modules: [Logging] }),
      }),
    ).rejects.toThrow('LUTRE_LOGGER_VALUE')
  })

  it('conditional providerで選択したrootだけにlifecycleを実行する', async () => {
    const events: string[] = []
    class Environment extends defineEnv(
      z.object({ DRIVER: z.enum(['a', 'b']) }),
    ) {}
    class Selected extends Logger {
      onModuleInit() {
        events.push('selected.init')
      }
    }
    class Unselected extends Logger {
      onModuleInit() {
        throw new Error('unselected.init')
      }
    }
    const ROOT = LoggerToken
    const Logging = defineModule({
      environment: [Environment],
      providers: [
        provide(ROOT).select(Environment.key('DRIVER'), {
          a: Selected,
          b: Unselected,
        }),
      ],
      exports: [ROOT],
    })
    const app = await bootstrapApplication({
      application: defineApplication({ modules: [Logging] }),
      environment: { DRIVER: 'a' },
    })
    try {
      expect(app.get(Logger)).toBeInstanceOf(Selected)
      expect(events).toEqual(['selected.init'])
    } finally {
      await app.close()
    }
  })

  it('Loggerの派生クラスを未登録のframework tokenとして扱わない', () => {
    class CustomLogger extends Logger {}
    class Service {
      readonly logger = inject(CustomLogger)
    }
    const model = defineApplication({
      modules: [defineModule({ providers: [Service] })],
    }).model
    expect(model.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'LUTRE_PROVIDER_DEPENDENCY_MISSING',
        message: expect.stringContaining('CustomLogger'),
      }),
    )
  })

  it('クラス自身の登録と予約tokenへのuseClass登録を区別する', async () => {
    class CustomLoggerService extends Logger {}
    const named = await bootstrapApplication({
      application: defineApplication({
        modules: [defineModule({ providers: [CustomLoggerService] })],
      }),
    })
    try {
      expect(named.get(LoggerToken)).not.toBeInstanceOf(CustomLoggerService)
      expect(named.get(CustomLoggerService)).toBeInstanceOf(CustomLoggerService)
    } finally {
      await named.close()
    }

    const reserved = await bootstrapApplication({
      application: defineApplication({
        modules: [
          defineModule({
            providers: [provide(LoggerToken).useClass(CustomLoggerService)],
            exports: [LoggerToken],
          }),
        ],
      }),
    })
    try {
      expect(reserved.get(LoggerToken)).toBeInstanceOf(CustomLoggerService)
      expect(reserved.get(LoggerToken).context.source).toBe('Application')
    } finally {
      await reserved.close()
    }
  })

  it('Loggerクラスの省略登録も同じ予約tokenとして解決する', async () => {
    class Service {
      readonly logger = inject(LoggerToken)
    }
    const app = await bootstrapApplication({
      application: defineApplication({
        modules: [
          defineModule({
            providers: [Logger, Service],
            exports: [LoggerToken],
          }),
        ],
      }),
    })
    try {
      expect(app.get(LoggerToken)).toBe(app.get(Logger))
      expect(app.get(LoggerToken).context.source).toBe('Application')
      expect(app.get(Service).logger.context.source).toBe('Service')
      expect(app.get(Service).logger.backend).toBe(app.get(LoggerToken).backend)
    } finally {
      await app.close()
    }
  })
})
