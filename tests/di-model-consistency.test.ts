import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  ApplicationKernelRuntime,
  bootstrapApplication,
  defineApplication,
  defineEnv,
  defineModule,
  inject,
  injectInquirer,
  InjectionContextError,
  provide,
  token,
  type DependencyConsumer,
} from '@loutrejs/loutre'
import { DependencyResolutionError, Logger } from '@loutrejs/loutre/runtime'
import { bindHttpServer, http } from '@loutrejs/loutre/http'
import { task } from '@loutrejs/loutre/tasks'
import { messagePort } from '@loutrejs/loutre/message-port'
import { bindWebSocketServer, websocket } from '@loutrejs/loutre/websocket'

describe('canonical Modelと実行時DIの依存照合', () => {
  it.each(['application', 'transient'] as const)(
    'inquirerで追加したprivate依存は解決前に拒否する（依存のscope=%s）',
    async (scope) => {
      const createHidden = vi.fn(() => ({}))
      const HiddenDependency = token<object>('HiddenDependency')
      class ConsumerAware {
        readonly dependency = injectInquirer()
          ? inject(HiddenDependency)
          : undefined
      }
      class Consumer {
        readonly value = inject(ConsumerAware)
      }
      const hidden = defineModule({
        providers: [
          provide(HiddenDependency).useFactory({ scope, use: createHidden }),
        ],
      })
      const feature = defineModule({
        providers: [
          provide(ConsumerAware).useClass(ConsumerAware, {
            scope: 'transient',
          }),
          Consumer,
        ],
      })
      const application = defineApplication({ modules: [hidden, feature] })
      expect(application.model.diagnostics).toEqual([])
      await expect(bootstrapApplication({ application })).rejects.toThrow(
        'LUTRE_DI_UNDECLARED_DEPENDENCY: ConsumerAware requested HiddenDependency',
      )
      expect(createHidden).toHaveBeenCalledTimes(scope === 'transient' ? 0 : 1)
      expect(injectInquirer()).toBeUndefined()
    },
  )

  it.each(['token', 'name'] as const)(
    'consumerの%sで依存先を変更してもModelへない依存を拒否する',
    async (branch) => {
      class Declared {}
      class Hidden {}
      const ALIAS = token<Consumer>('consumer.alias')
      const matches = (consumer: DependencyConsumer | undefined) =>
        branch === 'token'
          ? consumer === ALIAS
          : typeof consumer === 'function' && consumer.name === 'Consumer'
      class ConsumerAware {
        readonly dependency = matches(injectInquirer())
          ? inject(Hidden)
          : inject(Declared)
      }
      class Consumer {
        readonly value = inject(ConsumerAware)
      }
      const application = defineApplication({
        modules: [
          defineModule({ providers: [Hidden] }),
          defineModule({
            providers: [
              Declared,
              provide(ConsumerAware).useClass(ConsumerAware, {
                scope: 'transient',
              }),
              branch === 'token' ? provide(ALIAS).useClass(Consumer) : Consumer,
            ],
          }),
        ],
      })
      expect(application.model.nodes).toContainEqual(
        expect.objectContaining({
          token: ConsumerAware,
          dependencies: [Declared],
        }),
      )
      await expect(bootstrapApplication({ application })).rejects.toThrow(
        'ConsumerAware requested Hidden',
      )
    },
  )

  it('framework-provided Loggerにも宣言照合を適用する', async () => {
    class ConsumerAware {
      readonly logger = injectInquirer() ? inject(Logger) : undefined
    }
    class Consumer {
      readonly value = inject(ConsumerAware)
    }
    const application = defineApplication({
      modules: [
        defineModule({
          providers: [
            provide(ConsumerAware).useClass(ConsumerAware, {
              scope: 'transient',
            }),
            Consumer,
          ],
        }),
      ],
    })
    await expect(bootstrapApplication({ application })).rejects.toThrow(
      'ConsumerAware requested Logger',
    )
  })

  it('factoryは明示inject配列とmetadata保存を利用できる', async () => {
    class Backend {}
    const LOG = token<{
      backend: Backend
      consumer: DependencyConsumer | undefined
    }>('custom.logger')
    class Consumer {
      readonly logger = inject(LOG)
    }
    const application = await bootstrapApplication({
      application: defineApplication({
        modules: [
          defineModule({
            providers: [
              Backend,
              provide(LOG).useFactory({
                scope: 'transient',
                inject: [Backend],
                use: (backend) => ({ backend, consumer: injectInquirer() }),
              }),
              Consumer,
            ],
          }),
        ],
      }),
    })
    try {
      expect(application.get(Consumer).logger).toEqual({
        backend: application.get(Backend),
        consumer: Consumer,
      })
    } finally {
      await application.close()
    }
  })

  it('factoryのmetadata分岐からのinjectもresolverなしで拒否する', async () => {
    class Hidden {}
    const FACTORY = token<object>('factory')
    class Consumer {
      readonly value = inject(FACTORY)
    }
    const application = defineApplication({
      modules: [
        defineModule({ providers: [Hidden] }),
        defineModule({
          providers: [
            provide(FACTORY).useFactory({
              scope: 'transient',
              use: () => (injectInquirer() ? inject(Hidden) : {}),
            }),
            Consumer,
          ],
        }),
      ],
    })
    await expect(bootstrapApplication({ application })).rejects.toThrow(
      InjectionContextError,
    )
  })

  it('conditional providerの選択contractと全候補をModelで検証する', async () => {
    class Env extends defineEnv(z.object({ DRIVER: z.enum(['a', 'b']) })) {}
    class Shared {}
    class Hidden {}
    class DriverA {
      readonly dependency = inject(Shared)
    }
    class DriverB {
      readonly dependency = inject(Hidden)
    }
    const DRIVER = token<DriverA | DriverB>('driver')
    const application = defineApplication({
      modules: [
        defineModule({ providers: [Hidden] }),
        defineModule({
          environment: [Env],
          providers: [
            Shared,
            provide(DRIVER).select(Env.key('DRIVER'), {
              a: DriverA,
              b: DriverB,
            }),
          ],
        }),
      ],
    })
    expect(application.model.nodes).toContainEqual(
      expect.objectContaining({
        token: DRIVER,
        dependencies: [Env, Shared, Hidden],
      }),
    )
    expect(application.model.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_MODULE_VISIBILITY' }),
    )
    await expect(
      bootstrapApplication({ application, environment: { DRIVER: 'a' } }),
    ).rejects.toThrow('LUTRE_MODULE_VISIBILITY')
  })

  it('symbolを選択するconditional providerも依存を収集して解決する', async () => {
    const selected = Symbol('driver')
    class Env extends defineEnv(z.object({ DRIVER: z.custom<symbol>() })) {}
    class Backend {}
    class Driver {
      readonly backend = inject(Backend)
    }
    const DRIVER = token<Driver>('symbol.driver')
    const application = await bootstrapApplication({
      application: defineApplication({
        modules: [
          defineModule({
            environment: [Env],
            providers: [
              Backend,
              provide(DRIVER).select(Env.key('DRIVER'), { [selected]: Driver }),
            ],
          }),
        ],
      }),
      environment: { DRIVER: selected },
    })
    try {
      expect(application.get(DRIVER).backend).toBe(application.get(Backend))
    } finally {
      await application.close()
    }
  })

  it('conditional providerの選択候補にも実行時照合を適用する', async () => {
    class Env extends defineEnv(z.object({ DRIVER: z.literal('a') })) {}
    class Hidden {}
    class Driver {
      readonly dependency = injectInquirer() ? inject(Hidden) : undefined
    }
    const DRIVER = token<Driver>('driver')
    class Consumer {
      readonly driver = inject(DRIVER)
    }
    const application = defineApplication({
      modules: [
        defineModule({ providers: [Hidden] }),
        defineModule({
          environment: [Env],
          providers: [
            provide(DRIVER).select(
              Env.key('DRIVER'),
              { a: Driver },
              { scope: 'transient' },
            ),
            Consumer,
          ],
        }),
      ],
    })
    expect(application.model.diagnostics).toEqual([])
    await expect(
      bootstrapApplication({ application, environment: { DRIVER: 'a' } }),
    ).rejects.toThrow('driver requested Hidden')
  })

  it.each(['http', 'task', 'message-port', 'websocket'] as const)(
    '%sの構築時にruntime値から追加した依存を拒否する',
    async (protocol) => {
      const Config = token<{ enabled: boolean }>('config')
      const Hidden = token<object>('hidden')
      const createHidden = vi.fn(() => ({}))
      const construct = () => {
        if (inject(Config).enabled) inject(Hidden)
      }
      const executions = {
        http: http.implementation({
          name: 'test.http',
          contract: http.contract({
            hello: {
              method: 'GET',
              path: '/',
              responses: { ok: { status: 204 } },
            },
          }),
          factory: () => {
            construct()
            return { hello: (context) => context.response.ok({}) }
          },
        }),
        task: task<void, void>({
          name: 'test.task',
          factory: () => {
            construct()
            return async () => undefined
          },
        }),
        'message-port': messagePort.implementation({
          name: 'test.message-port',
          contract: messagePort.contract({
            hello: { responses: { ok: z.string() } },
          }),
          factory: () => {
            construct()
            return { hello: (context) => context.response.ok('hello') }
          },
        }),
        websocket: websocket.implementation({
          name: 'test.websocket',
          contract: websocket.contract({ hello: { path: '/' } }),
          factory: () => {
            construct()
            return { hello: async () => undefined }
          },
        }),
      }
      const application = defineApplication({
        modules: [
          defineModule({
            providers: [
              provide(Hidden).useFactory({
                scope: 'transient',
                use: createHidden,
              }),
            ],
          }),
          defineModule({
            providers: [provide(Config).useValue({ enabled: true })],
            executions: [executions[protocol]],
          }),
        ],
      })
      expect(application.model.diagnostics).toEqual([])
      await expect(
        bootstrapApplication({
          application,
          capabilities: [
            bindHttpServer({ runtime: 'test' }),
            bindWebSocketServer({
              runtime: 'test',
              async upgrade() {
                throw new Error('使用しないdriver')
              },
            }),
          ],
        }),
      ).rejects.toThrow('LUTRE_DI_UNDECLARED_DEPENDENCY:')
      expect(createHidden).not.toHaveBeenCalled()
    },
  )

  it('HTTP Layerは所属Executionの依存宣言を照合する', async () => {
    const Config = token<{ enabled: boolean }>('config')
    const Hidden = token<object>('hidden')
    const createHidden = vi.fn(() => ({}))
    const errors: unknown[] = []
    const layer = http.middleware({
      name: 'conditional-layer',
      factory: () => {
        try {
          if (inject(Config).enabled) inject(Hidden)
        } catch (error) {
          if (error instanceof DependencyResolutionError) errors.push(error)
          throw error
        }
        return async (_context, next) => {
          await next()
        }
      },
    })
    const execution = http.implementation({
      name: 'layer-owner',
      contract: http.contract({
        hello: {
          method: 'GET',
          path: '/',
          middlewares: [layer],
          responses: { ok: { status: 204 } },
        },
      }),
      factory: () => ({ hello: (context) => context.response.ok({}) }),
    })
    const application = await bootstrapApplication({
      application: defineApplication({
        modules: [
          defineModule({
            providers: [
              provide(Hidden).useFactory({
                scope: 'transient',
                use: createHidden,
              }),
            ],
          }),
          defineModule({
            providers: [provide(Config).useValue({ enabled: true })],
            executions: [execution],
          }),
        ],
      }),
      capabilities: [bindHttpServer({ runtime: 'test' })],
    })
    try {
      const response = await application.http.fetch(new Request('http://test/'))
      expect(response.status).toBe(500)
      expect(errors).toHaveLength(1)
      expect(String(errors[0])).toContain('layer-owner requested hidden')
      expect(createHidden).not.toHaveBeenCalled()
    } finally {
      await application.close()
    }
  })

  it('Executionの未指定・不明なidentityを拒否し、sourceで代用しない', async () => {
    class Dependency {}
    const execution = task<void, void>({
      name: 'declared',
      factory:
        (dependency = inject(Dependency)) =>
        async () => {
          void dependency
        },
    })
    const definition = defineApplication({
      modules: [
        defineModule({ providers: [Dependency], executions: [execution] }),
      ],
    })
    const runtime = new ApplicationKernelRuntime(definition.model)
    await runtime.initialize()
    try {
      expect(() =>
        Reflect.apply(runtime.resolve, runtime, [Dependency]),
      ).toThrow('LUTRE_DI_EXECUTION_CONTEXT')
      expect(() =>
        Reflect.apply(runtime.resolve, runtime, [Dependency, 'task.declared']),
      ).toThrow('LUTRE_DI_EXECUTION_CONTEXT')
      expect(() =>
        runtime.resolve(Dependency, { executionId: 'unknown' }),
      ).toThrow('LUTRE_DI_EXECUTION_CONTEXT')
      expect(
        runtime.resolve(Dependency, { executionId: 'task.declared' }),
      ).toBe(runtime.get(Dependency))
    } finally {
      await runtime.shutdown()
    }
  })
})
