import {
  Inject,
  defineModule,
  provide,
  token,
} from '@loutrefw/core'
import {
  collectRuntimeModuleGraph,
  Container,
  DependencyResolutionError,
} from '@loutrefw/runtime'

interface Clock {
  readonly id: number
}

const CLOCK = token<Clock>('clock')
const TRANSIENT = token<{ readonly id: number }>('transient')

class ClockReader {
  constructor(@Inject(CLOCK) readonly clock: Clock) {}
}

describe('DI container', () => {
  it('resolves typed custom tokens and application-scoped class providers', async () => {
    const module = defineModule(() => ({
      providers: [provide(CLOCK).useValue({ id: 1 }), ClockReader],
    }))()
    const graph = collectRuntimeModuleGraph([module])
    const container = new Container(graph.providers)

    const first = await container.resolve(ClockReader)
    const second = await container.resolve(ClockReader)
    expect(first).toBe(second)
    expect(first.clock.id).toBe(1)
  })

  it('honors transient scope', async () => {
    let next = 0
    const module = defineModule(() => ({
      providers: [
        provide(TRANSIENT).useFactory({
          scope: 'transient',
          use: () => ({ id: ++next }),
        }),
      ],
    }))()
    const container = new Container(collectRuntimeModuleGraph([module]).providers)
    expect((await container.resolve(TRANSIENT)).id).toBe(1)
    expect((await container.resolve(TRANSIENT)).id).toBe(2)
  })

  it('supports multiple instances of one parameterized Module', async () => {
    const PRIMARY = token<string>('database.primary')
    const ANALYTICS = token<string>('database.analytics')
    const DatabaseModule = defineModule<{
      readonly target: typeof PRIMARY | typeof ANALYTICS
      readonly value: string
    }>((args) => ({
      providers: [provide(args.target).useValue(args.value)],
    }))
    const AppModule = defineModule(() => ({
      imports: [
        DatabaseModule({ target: PRIMARY, value: 'primary' }),
        DatabaseModule({ target: ANALYTICS, value: 'analytics' }),
      ],
    }))()
    const container = new Container(
      collectRuntimeModuleGraph([AppModule]).providers,
    )

    expect(await container.resolve(PRIMARY)).toBe('primary')
    expect(await container.resolve(ANALYTICS)).toBe('analytics')
  })

  it('does not fall back to runtime type reflection', async () => {
    class Dependency {}
    class Consumer {
      constructor(readonly dependency: Dependency) {}
    }
    const container = new Container([])
    await expect(container.resolve(Consumer)).rejects.toBeInstanceOf(
      DependencyResolutionError,
    )
  })
})
