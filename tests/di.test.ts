import {
  defineModule,
  defineApplication,
  composeLayers,
  defineLayer,
  bootstrapApplication,
  inject,
  injectInquirer,
  tokenName,
  runInInjectionContext,
  type DependencyConsumer,
  InjectionContextError,
  provide,
  normalizeProvider,
  token,
  type ProviderDeclaration,
} from '@loutrejs/loutre'
import {
  Container,
  DependencyResolutionError,
  Logger,
} from '@loutrejs/loutre/runtime'

interface Clock {
  readonly id: number
}

const CLOCK = token<Clock>('clock')
const TRANSIENT = token<{ readonly id: number }>('transient')

class ClockReader {
  constructor(readonly clock = inject(CLOCK)) {}
}

function containerFor(providers: readonly ProviderDeclaration[]): Container {
  const Module = defineModule(() => ({ providers }))
  return new Container(
    (Module().definition.providers ?? []).map(normalizeProvider),
  )
}

describe('同期DI Container', () => {
  it('class tokenとcustom tokenをapplication scopeで同期解決する', () => {
    const container = containerFor([
      provide(CLOCK).useValue({ id: 1 }),
      ClockReader,
    ])

    const first = container.resolve(ClockReader)
    const second = container.resolve(ClockReader)
    expect(first).toBe(second)
    expect(first.clock.id).toBe(1)
  })

  it('Container外のinjectを拒否する', () => {
    expect(() => inject(CLOCK)).toThrow(InjectionContextError)
    expect(() => inject(CLOCK)).toThrow('Loutre injection context')
  })

  it('nested injection後にconsumer contextを復元する', () => {
    class Nested {
      constructor(readonly clock = inject(CLOCK)) {}
    }
    class Consumer {
      readonly before: Clock
      readonly nested: Nested
      readonly after: Clock

      constructor() {
        this.before = inject(CLOCK)
        this.nested = inject(Nested)
        this.after = inject(CLOCK)
      }
    }
    const module = defineModule(() => ({
      providers: [provide(CLOCK).useValue({ id: 1 }), Nested, Consumer],
    }))()
    const container = new Container(
      (module.definition.providers ?? []).map(normalizeProvider),
    )

    expect(container.resolve(Consumer).after.id).toBe(1)
  })

  it('constructor例外時もInjection Contextを復元する', () => {
    class Broken {
      constructor() {
        inject(CLOCK)
        throw new Error('construction failed')
      }
    }
    const container = containerFor([provide(CLOCK).useValue({ id: 1 }), Broken])

    expect(() => container.resolve(Broken)).toThrow('construction failed')
    expect(() => inject(CLOCK)).toThrow(InjectionContextError)
  })

  it('transient scopeは解決ごとに別instanceを生成する', () => {
    let next = 0
    const container = containerFor([
      provide(TRANSIENT).useFactory({
        scope: 'transient',
        use: () => ({ id: ++next }),
      }),
    ])
    expect(container.resolve(TRANSIENT).id).toBe(1)
    expect(container.resolve(TRANSIENT).id).toBe(2)
  })

  it('application consumerへ注入したtransientをconsumer内で保持する', () => {
    let next = 0
    class Consumer {
      constructor(readonly value = inject(TRANSIENT)) {}
    }
    const container = containerFor([
      provide(TRANSIENT).useFactory({
        scope: 'transient',
        use: () => ({ id: ++next }),
      }),
      Consumer,
    ])

    expect(container.resolve(Consumer).value.id).toBe(1)
    expect(container.resolve(Consumer).value.id).toBe(1)
    expect(container.resolve(TRANSIENT).id).toBe(2)
  })

  it('同期factoryのinject declarationを解決する', () => {
    const LABEL = token<string>('label')
    const container = containerFor([
      provide(CLOCK).useValue({ id: 7 }),
      provide(LABEL).useFactory({
        inject: [CLOCK],
        use: (clock) => `clock-${clock.id}`,
      }),
    ])
    expect(container.resolve(LABEL)).toBe('clock-7')
  })

  it('async/thenable factoryをfail-fastする', () => {
    const ASYNC = token<unknown>('async')
    const container = containerFor([
      provide(ASYNC).useFactory({
        use: (() => Promise.resolve({})) as never,
      }),
    ])
    expect(() => container.resolve(ASYNC)).toThrow('LUTRE_DI_ASYNC_FACTORY')
  })

  it('循環依存を拒否する', () => {
    const FIRST = token<unknown>('cycle.first')
    const SECOND = token<unknown>('cycle.second')
    const container = containerFor([
      provide(FIRST).useFactory({ inject: [SECOND], use: () => ({}) }),
      provide(SECOND).useFactory({ inject: [FIRST], use: () => ({}) }),
    ])
    expect(() => container.resolve(FIRST)).toThrow(
      'cycle.first -> cycle.second -> cycle.first',
    )
  })

  it('未宣言classのauto-resolutionを拒否する', () => {
    class Dependency {}
    class Consumer {
      constructor(readonly dependency = inject(Dependency)) {}
    }
    const container = containerFor([Consumer])
    expect(() => container.resolve(Consumer)).toThrow(DependencyResolutionError)
    expect(() => container.resolve(Consumer)).toThrow('LUTRE_DI_UNRESOLVED')
  })

  it('default parameterではないconstructor dependencyを拒否する', () => {
    class Dependency {}
    class Consumer {
      constructor(readonly dependency: Dependency) {}
    }
    const container = containerFor([Dependency, Consumer])
    expect(() => container.resolve(Consumer)).toThrow('LUTRE_DI_CONSTRUCTOR')
  })

  it('普通のconstructor argumentでunit test dependencyをoverrideできる', () => {
    const mock = { id: 99 }
    expect(new ClockReader(mock).clock).toBe(mock)
  })
})

describe('依存元consumerの取得', () => {
  it('Model構築とApplication起動を通してconsumerを取得できる', async () => {
    class AppLogger {
      readonly consumer = injectInquirer()
    }
    class Service {
      readonly logger = inject(AppLogger)
    }
    const module = defineModule(() => ({
      providers: [
        provide(AppLogger).useClass(AppLogger, { scope: 'transient' }),
        Service,
      ],
    }))()
    const app = await bootstrapApplication({
      application: defineApplication({ modules: [module] }),
    })
    try {
      expect(app.get(Service).logger.consumer).toBe(Service)
    } finally {
      await app.close()
    }
  })

  it('transient classへconsumerのtokenを渡し、Loggerのsourceを維持する', () => {
    class AppLogger {
      constructor(
        readonly inquirer = injectInquirer(),
        readonly logger = inject(Logger),
      ) {}
    }
    class ServiceA {
      constructor(readonly logger = inject(AppLogger)) {}
    }
    class ServiceB {
      constructor(readonly logger = inject(AppLogger)) {}
    }
    const container = containerFor([
      provide(AppLogger).useClass(AppLogger, { scope: 'transient' }),
      ServiceA,
      ServiceB,
    ])
    const first = container.resolve(ServiceA).logger
    const second = container.resolve(ServiceB).logger
    expect(first).not.toBe(second)
    expect(first.inquirer).toBe(ServiceA)
    expect(second.inquirer).toBe(ServiceB)
    expect(tokenName(first.inquirer as typeof ServiceA)).toBe('ServiceA')
    expect(first.logger.context.source).toBe('AppLogger')
    expect(second.logger.context.source).toBe('AppLogger')
    expect(container.resolve(AppLogger).inquirer).toBeUndefined()
    expect(injectInquirer()).toBeUndefined()
  })

  it('factoryと入れ子classで直接の依存元を取得し、外側のcontextを復元する', () => {
    const FACTORY = token<{
      inquirer: DependencyConsumer | undefined
      nested: Nested
    }>('factory')
    class Nested {
      readonly inquirer = injectInquirer()
    }
    class Consumer {
      readonly before = injectInquirer()
      readonly value = inject(FACTORY)
      readonly after = injectInquirer()
    }
    class Root {
      readonly consumer = inject(Consumer)
    }
    const container = containerFor([
      provide(Nested).useClass(Nested, { scope: 'transient' }),
      provide(FACTORY).useFactory({
        scope: 'transient',
        inject: [Nested],
        use: (nested: Nested) => ({ inquirer: injectInquirer(), nested }),
      }),
      Consumer,
      Root,
    ])
    const consumer = container.resolve(Root).consumer
    expect(consumer.value.inquirer).toBe(Consumer)
    expect(consumer.value.nested.inquirer).toBe(FACTORY)
    expect(consumer.before).toBe(Root)
    expect(consumer.after).toBe(Root)
    expect(container.resolve(FACTORY).inquirer).toBeUndefined()
    expect(injectInquirer()).toBeUndefined()
  })

  it('useClassの別名consumerはimplementationではなく登録tokenを渡す', () => {
    const ALIAS = token<Consumer>('consumer.alias')
    class Dependency {
      readonly inquirer = injectInquirer()
    }
    class Consumer {
      readonly dependency = inject(Dependency)
    }
    const container = containerFor([
      provide(Dependency).useClass(Dependency, { scope: 'transient' }),
      provide(ALIAS).useClass(Consumer),
    ])
    expect(container.resolve(ALIAS).dependency.inquirer).toBe(ALIAS)
  })

  it('Executionのdescriptorをconsumerとして引き継ぐ', () => {
    class Dependency {
      readonly inquirer = injectInquirer()
    }
    const container = containerFor([
      provide(Dependency).useClass(Dependency, { scope: 'transient' }),
    ])
    const consumer = { id: 'execution.test', name: 'Test', kind: 'execution' }
    const value = runInInjectionContext(
      {
        consumer,
        resolve: (dependency, requester) =>
          container.resolve(dependency, {
            source: consumer.id,
            consumer: requester,
          }),
      },
      () => inject(Dependency),
    )
    expect(value.inquirer).toBe(consumer)
  })

  it('LayerにもExecutionと同じ規則でconsumer metadataを渡す', async () => {
    class AppLogger {
      readonly consumer = injectInquirer()
    }
    const container = containerFor([
      provide(AppLogger).useClass(AppLogger, { scope: 'transient' }),
    ])
    let consumer: DependencyConsumer | undefined
    const layer = defineLayer({
      name: 'auth',
      factory:
        (logger = inject(AppLogger)) =>
        async (_context, next) => {
          consumer = logger.consumer
          await next()
        },
    })
    await composeLayers({
      context: {},
      layers: [layer],
      resolve: (dependency, context) => container.resolve(dependency, context),
      terminal: async () => undefined,
    })
    expect(consumer).toEqual({
      kind: 'layer',
      id: 'layer:0:auth',
      name: 'auth',
    })
  })

  it('直接resolveはambientなconsumerを別Containerへ持ち込まない', () => {
    class Dependency {
      readonly inquirer = injectInquirer()
    }
    const first = containerFor([
      provide(Dependency).useClass(Dependency, { scope: 'transient' }),
    ])
    const second = containerFor([
      provide(Dependency).useClass(Dependency, { scope: 'transient' }),
    ])
    const consumer = { id: 'execution.test', name: 'Test' }
    runInInjectionContext(
      {
        consumer,
        resolve: (dependency, requester) =>
          first.resolve(dependency, { consumer: requester }),
      },
      () => {
        expect(inject(Dependency).inquirer).toBe(consumer)
        expect(second.resolve(Dependency).inquirer).toBeUndefined()
      },
    )
  })

  it('factoryの構築metadataは未宣言のinjectを許可しない', () => {
    const FACTORY = token<Clock>('factory.clock')
    const container = containerFor([
      provide(CLOCK).useValue({ id: 1 }),
      provide(FACTORY).useFactory({ use: () => inject(CLOCK) }),
    ])
    expect(() => container.resolve(FACTORY)).toThrow(InjectionContextError)
    expect(injectInquirer()).toBeUndefined()
  })

  it('factoryが例外を投げても依存元contextを復元する', () => {
    const BROKEN = token<unknown>('broken')
    const container = containerFor([
      provide(BROKEN).useFactory({
        use: () => {
          throw new Error('factory failed')
        },
      }),
    ])
    expect(() => container.resolve(BROKEN)).toThrow('factory failed')
    expect(injectInquirer()).toBeUndefined()
    expect(() => inject(BROKEN)).toThrow(InjectionContextError)
  })
})
