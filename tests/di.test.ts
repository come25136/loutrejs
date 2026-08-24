import {
  defineModule,
  inject,
  InjectionContextError,
  provide,
  token,
  type ProviderDeclaration,
} from '@loutrejs/core'
import {
  collectRuntimeModuleGraph,
  Container,
  DependencyResolutionError,
} from '@loutrejs/runtime'

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
  return new Container(collectRuntimeModuleGraph([Module()]).providers)
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
    const edges: string[] = []
    const module = defineModule(() => ({
      providers: [provide(CLOCK).useValue({ id: 1 }), Nested, Consumer],
    }))()
    const container = new Container(collectRuntimeModuleGraph([module]).providers, {
      recorder: {
        record: (consumer, dependency) => {
          const from = typeof consumer === 'function' ? consumer.name : consumer.id
          const to = typeof dependency === 'function' ? dependency.name : dependency.id
          edges.push(`${from}->${to}`)
        },
      },
    })

    expect(container.resolve(Consumer).after.id).toBe(1)
    expect(edges).toEqual([
      'Consumer->clock',
      'Consumer->Nested',
      'Nested->clock',
      'Consumer->clock',
    ])
  })

  it('constructor例外時もInjection Contextを復元する', () => {
    class Broken {
      constructor() {
        inject(CLOCK)
        throw new Error('construction failed')
      }
    }
    const container = containerFor([
      provide(CLOCK).useValue({ id: 1 }),
      Broken,
    ])

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
