import {
  Inject,
  defineModule,
  provide,
  token,
} from '@loutrejs/core'
import {
  collectRuntimeModuleGraph,
  Container,
  DependencyResolutionError,
} from '@loutrejs/runtime'
import { runtimeLinkageTarget } from '@loutrejs/runtime/internal'

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
    container[runtimeLinkageTarget]({
      version: 1,
      fingerprint: 'test',
      bindings: [[ClockReader, [CLOCK]]],
    })

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

  it('application-scoped async factoryを並行解決しても1回だけ生成する', async () => {
    let created = 0
    const ASYNC = token<{ readonly id: number }>('async-application')
    const module = defineModule(() => ({
      providers: [
        provide(ASYNC).useFactory({
          use: (async () => {
            await Promise.resolve()
            return { id: ++created }
          }) as never,
        }),
      ],
    }))()
    const container = new Container(collectRuntimeModuleGraph([module]).providers)

    const [first, second] = await Promise.all([
      container.resolve(ASYNC),
      container.resolve(ASYNC),
    ])

    expect(created).toBe(1)
    expect(first).toBe(second)
  })

  it('複数consumerから並行解決したapplication-scoped classを共有する', async () => {
    let constructed = 0
    class SharedService {
      constructor() {
        constructed += 1
      }
    }
    const FIRST = token<SharedService>('consumer.first')
    const SECOND = token<SharedService>('consumer.second')
    const module = defineModule(() => ({
      providers: [
        SharedService,
        provide(FIRST).useFactory({
          inject: [SharedService],
          use: (service) => service,
        }),
        provide(SECOND).useFactory({
          inject: [SharedService],
          use: (service) => service,
        }),
      ],
    }))()
    const container = new Container(collectRuntimeModuleGraph([module]).providers)

    const [first, second] = await Promise.all([
      container.resolve(FIRST),
      container.resolve(SECOND),
    ])

    expect(constructed).toBe(1)
    expect(first).toBe(second)
  })

  it('application-scoped Providerの生成失敗後は再試行できる', async () => {
    let attempts = 0
    const RETRYABLE = token<{ readonly ready: boolean }>('retryable')
    const module = defineModule(() => ({
      providers: [
        provide(RETRYABLE).useFactory({
          use: () => {
            attempts += 1
            if (attempts === 1) throw new Error('初回だけ失敗')
            return { ready: true }
          },
        }),
      ],
    }))()
    const container = new Container(collectRuntimeModuleGraph([module]).providers)

    await expect(container.resolve(RETRYABLE)).rejects.toThrow('初回だけ失敗')
    await expect(container.resolve(RETRYABLE)).resolves.toEqual({ ready: true })
    expect(attempts).toBe(2)
  })

  it('transient Providerは並行解決でも別instanceを生成する', async () => {
    let created = 0
    const module = defineModule(() => ({
      providers: [
        provide(TRANSIENT).useFactory({
          scope: 'transient',
          use: (async () => {
            await Promise.resolve()
            return { id: ++created }
          }) as never,
        }),
      ],
    }))()
    const container = new Container(collectRuntimeModuleGraph([module]).providers)

    const [first, second] = await Promise.all([
      container.resolve(TRANSIENT),
      container.resolve(TRANSIENT),
    ])

    expect(created).toBe(2)
    expect(first).not.toBe(second)
  })

  it('application-scoped Providerの循環依存を明示的に拒否する', async () => {
    const FIRST = token<unknown>('cycle.first')
    const SECOND = token<unknown>('cycle.second')
    const module = defineModule(() => ({
      providers: [
        provide(FIRST).useFactory({ inject: [SECOND], use: () => ({}) }),
        provide(SECOND).useFactory({ inject: [FIRST], use: () => ({}) }),
      ],
    }))()
    const container = new Container(collectRuntimeModuleGraph([module]).providers)

    await expect(container.resolve(FIRST)).rejects.toThrow(
      '循環依存を検出しました: cycle.first -> cycle.second -> cycle.first',
    )
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
