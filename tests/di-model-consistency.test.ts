import * as fixture from './helpers/identities.js'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  ApplicationKernelRuntime,
  bootstrapApplication,
  application,
  env,
  defineExecution,
  defineExecutionExtension,
  module,
  inject,
  injectInquirer,
  InjectionContextError,
  provide,
  token,
  type DependencyConsumer,
  type ExecutionRuntimeBinding,
} from '@loutrejs/loutre'
import { LoggerToken } from '@loutrejs/loutre'
import { DependencyResolutionError } from '@loutrejs/loutre/runtime'
import { bindHttpServer, http } from '@loutrejs/loutre/http'
import { task, tasksExtension } from '@loutrejs/loutre/tasks'
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
      const hidden = module({
        providers: [
          provide(HiddenDependency).useFactory({ scope, use: createHidden }),
        ],
      })
      const feature = module({
        providers: [
          provide(ConsumerAware).useClass(ConsumerAware, {
            scope: 'transient',
          }),
          Consumer,
        ],
      })
      const appDefinition = application({ modules: [hidden, feature] })
      expect(appDefinition.model.diagnostics).toEqual([])
      await expect(
        bootstrapApplication({ application: appDefinition }),
      ).rejects.toThrow(
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
      const appDefinition = application({
        modules: [
          module({ providers: [Hidden] }),
          module({
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
      expect(appDefinition.model.nodes).toContainEqual(
        expect.objectContaining({
          token: ConsumerAware,
          dependencies: [Declared],
        }),
      )
      await expect(
        bootstrapApplication({ application: appDefinition }),
      ).rejects.toThrow('ConsumerAware requested Hidden')
    },
  )

  it('framework-provided Loggerにも宣言照合を適用する', async () => {
    class ConsumerAware {
      readonly logger = injectInquirer() ? inject(LoggerToken) : undefined
    }
    class Consumer {
      readonly value = inject(ConsumerAware)
    }
    const appDefinition = application({
      modules: [
        module({
          providers: [
            provide(ConsumerAware).useClass(ConsumerAware, {
              scope: 'transient',
            }),
            Consumer,
          ],
        }),
      ],
    })
    await expect(
      bootstrapApplication({ application: appDefinition }),
    ).rejects.toThrow('ConsumerAware requested LoggerToken')
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
    const app = await bootstrapApplication({
      application: application({
        modules: [
          module({
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
      expect(app.get(Consumer).logger).toEqual({
        backend: app.get(Backend),
        consumer: Consumer,
      })
    } finally {
      await app.close()
    }
  })

  it('factoryのmetadata分岐からのinjectもresolverなしで拒否する', async () => {
    class Hidden {}
    const FACTORY = token<object>('factory')
    class Consumer {
      readonly value = inject(FACTORY)
    }
    const appDefinition = application({
      modules: [
        module({ providers: [Hidden] }),
        module({
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
    await expect(
      bootstrapApplication({ application: appDefinition }),
    ).rejects.toThrow(InjectionContextError)
  })

  it('conditional providerの選択contractと全候補をModelで検証する', async () => {
    class Env extends env(z.object({ DRIVER: z.enum(['a', 'b']) })) {}
    class Shared {}
    class Hidden {}
    class DriverA {
      readonly dependency = inject(Shared)
    }
    class DriverB {
      readonly dependency = inject(Hidden)
    }
    const DRIVER = token<DriverA | DriverB>('driver')
    const appDefinition = application({
      modules: [
        module({ providers: [Hidden] }),
        module({
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
    expect(appDefinition.model.nodes).toContainEqual(
      expect.objectContaining({
        token: DRIVER,
        dependencies: [Env, Shared, Hidden],
      }),
    )
    expect(appDefinition.model.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_MODULE_VISIBILITY' }),
    )
    await expect(
      bootstrapApplication({
        application: appDefinition,
        environment: { DRIVER: 'a' },
      }),
    ).rejects.toThrow('LUTRE_MODULE_VISIBILITY')
  })

  it('symbolを選択するconditional providerも依存を収集して解決する', async () => {
    const selected = Symbol('driver')
    class Env extends env(z.object({ DRIVER: z.custom<symbol>() })) {}
    class Backend {}
    class Driver {
      readonly backend = inject(Backend)
    }
    const DRIVER = token<Driver>('symbol.driver')
    const app = await bootstrapApplication({
      application: application({
        modules: [
          module({
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
      expect(app.get(DRIVER).backend).toBe(app.get(Backend))
    } finally {
      await app.close()
    }
  })

  it('conditional providerの選択候補にも実行時照合を適用する', async () => {
    class Env extends env(z.object({ DRIVER: z.literal('a') })) {}
    class Hidden {}
    class Driver {
      readonly dependency = injectInquirer() ? inject(Hidden) : undefined
    }
    const DRIVER = token<Driver>('driver')
    class Consumer {
      readonly driver = inject(DRIVER)
    }
    const appDefinition = application({
      modules: [
        module({ providers: [Hidden] }),
        module({
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
    expect(appDefinition.model.diagnostics).toEqual([])
    await expect(
      bootstrapApplication({
        application: appDefinition,
        environment: { DRIVER: 'a' },
      }),
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
      const routeContract = http.contract({
        hello: {
          method: 'GET',
          path: '/',
          responses: { ok: { status: 204 } },
        },
      })
      const executions = {
        http: http.implementation({
          name: 'test.http',
          contract: routeContract,
          factory: () => {
            construct()
            return { hello: () => ({ schema: routeContract.hello.ok }) }
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
      const appDefinition = application({
        modules: [
          module({
            providers: [
              provide(Hidden).useFactory({
                scope: 'transient',
                use: createHidden,
              }),
            ],
          }),
          module({
            providers: [provide(Config).useValue({ enabled: true })],
            executions: [executions[protocol]],
          }),
        ],
      })
      expect(appDefinition.model.diagnostics).toEqual([])
      await expect(
        bootstrapApplication({
          application: appDefinition,
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
    const routeContract = http.contract({
      hello: {
        method: 'GET',
        path: '/',
        middlewares: [layer],
        responses: { ok: { status: 204 } },
      },
    })
    const execution = http.implementation({
      name: 'layer-owner',
      contract: routeContract,
      factory: () => ({ hello: () => ({ schema: routeContract.hello.ok }) }),
    })
    const app = await bootstrapApplication({
      application: application({
        modules: [
          module({
            providers: [
              provide(Hidden).useFactory({
                scope: 'transient',
                use: createHidden,
              }),
            ],
          }),
          module({
            providers: [provide(Config).useValue({ enabled: true })],
            executions: [execution],
          }),
        ],
      }),
      capabilities: [bindHttpServer({ runtime: 'test' })],
    })
    try {
      const response = await app.http.fetch(new Request('http://test/'))
      expect(response.status).toBe(500)
      expect(errors).toHaveLength(1)
      expect(String(errors[0])).toContain('layer-owner requested hidden')
      expect(createHidden).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('独自ExtensionとHostはcanonical Executionへの参照と同じresolverを受け取る', async () => {
    let runtimeBinding: ExecutionRuntimeBinding | undefined
    let hostBinding: ExecutionRuntimeBinding | undefined
    const extension = defineExecutionExtension({
      kind: 'execution-extension',
      abiVersion: '1',
      name: 'fixture:bound-resolver',
      compile() {
        return {
          kind: 'execution' as const,
          id: 'bound.fixture',
          executionKind: 'fixture',
          dependencies: [LoggerToken],
          capabilities: [],
          compiled: null,
        }
      },
      createRuntime({ executions }) {
        runtimeBinding = executions[0]
        expect(runtimeBinding?.resolve(LoggerToken).context.source).toBe(
          'bound.fixture',
        )
        return { close() {} }
      },
      host: {
        namespace: 'fixture',
        create({ executions }) {
          hostBinding = executions[0]
          return {}
        },
      },
    })
    const definition = application({
      modules: [module({ executions: [defineExecution(extension, {})] })],
    })
    const app = await bootstrapApplication({ application: definition })
    try {
      expect(runtimeBinding).toBe(hostBinding)
      expect(runtimeBinding?.execution).toBe(definition.model.executions[0])
      expect(Object.isFrozen(runtimeBinding)).toBe(true)
      expect(definition.model.executions[0]).not.toHaveProperty('resolve')
    } finally {
      await app.close()
    }
  })

  it('束縛したresolverは表示metadataで別Executionの宣言へ切り替わらない', async () => {
    class Declared {}
    class Hidden {}
    const declared = task<void, void>({
      name: 'declared',
      factory:
        (dependency = inject(Declared)) =>
        async () => {
          void dependency
        },
    })
    const other = task<void, void>({
      name: 'other',
      factory:
        (dependency = inject(Hidden)) =>
        async () => {
          void dependency
        },
    })
    const definition = application({
      modules: [
        module({ providers: [Declared], executions: [declared] }),
        module({ providers: [Hidden], executions: [other] }),
      ],
    })
    const runtime = new ApplicationKernelRuntime(definition.model)
    await runtime.initialize()
    try {
      const bindings = runtime.executionBindings(tasksExtension)
      const first = bindings.find(
        ({ execution }) => execution.id === 'task.declared',
      )!
      const second = bindings.find(
        ({ execution }) => execution.id === 'task.other',
      )!
      expect(first.execution).toBe(
        definition.model.executions.find(({ id }) => id === 'task.declared'),
      )
      expect(first.execution).not.toHaveProperty('resolve')
      expect(runtime).not.toHaveProperty('resolve')
      expect(first.resolve(Declared)).toBe(runtime.get(Declared))
      expect(second.resolve(Hidden)).toBe(runtime.get(Hidden))
      expect(() => first.resolve(Hidden, 'task.other')).toThrow(
        'task.declared requested Hidden',
      )
      expect(() =>
        first.resolve(Hidden, {
          source: 'task.other',
          consumer: {
            id: fixture.dependencyConsumerId('task.other'),
            name: 'other',
          },
        }),
      ).toThrow('task.declared requested Hidden')
    } finally {
      await runtime.shutdown()
    }
  })

  it('束縛したresolverの状態とinstanceはApplicationの寿命に従う', async () => {
    class Dependency {}
    const execution = task<void, void>({
      name: 'declared',
      factory:
        (dependency = inject(Dependency)) =>
        async () => {
          void dependency
        },
    })
    const definition = application({
      modules: [module({ providers: [Dependency], executions: [execution] })],
    })
    const first = new ApplicationKernelRuntime(definition.model)
    const second = new ApplicationKernelRuntime(definition.model)
    const resolveFirst = first.executionBindings(tasksExtension)[0]!.resolve
    const resolveSecond = second.executionBindings(tasksExtension)[0]!.resolve
    expect(() => resolveFirst(Dependency)).toThrow('LUTRE_APPLICATION_STATE')
    try {
      await first.initialize()
      await second.initialize()
      expect(resolveFirst(Dependency)).toBe(first.get(Dependency))
      expect(resolveSecond(Dependency)).toBe(second.get(Dependency))
      expect(resolveFirst(Dependency)).not.toBe(resolveSecond(Dependency))
      await first.shutdown()
      expect(() => resolveFirst(Dependency)).toThrow('LUTRE_APPLICATION_STATE')
      expect(resolveSecond(Dependency)).toBe(second.get(Dependency))
    } finally {
      await first.shutdown()
      await second.shutdown()
    }
  })
})
