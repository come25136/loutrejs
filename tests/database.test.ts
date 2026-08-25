import {
  layer,
  provide,
  shortCircuit,
  token,
  type TerminalLayerDescriptor,
} from '@loutrejs/core'
import {
  DatabaseError,
  DatabaseService,
  transaction,
  type DatabaseAdapterSpec,
} from '@loutrejs/database'
import { Container, executePipeline } from '@loutrejs/runtime'

interface FakeClient {
  readonly kind: 'root' | 'transaction'
  readonly id: number
}

interface FakeSpec extends DatabaseAdapterSpec {
  readonly client: FakeClient
  readonly transactionClient: FakeClient
  readonly beginOptions: { readonly label?: string }
  readonly savepointOptions: { readonly label?: string }
  readonly capabilities: {
    readonly transactions: true
    readonly savepoints: true
  }
}

class FakeDatabase extends DatabaseService<FakeSpec> {
  readonly events: string[] = []
  protected readonly transactionCapabilities = {
    transactions: true,
    savepoints: true,
  } as const
  #sequence = 0

  protected connect(): FakeClient {
    this.events.push('connect')
    return { kind: 'root', id: ++this.#sequence }
  }

  protected disconnect(client: FakeClient): void {
    this.events.push(`disconnect:${client.id}`)
  }

  protected async beginTransaction<TResult>(
    _client: FakeClient,
    options: FakeSpec['beginOptions'] | undefined,
    execute: (transaction: FakeClient) => Promise<TResult>,
  ): Promise<TResult> {
    const transaction = { kind: 'transaction', id: ++this.#sequence } as const
    this.events.push(`begin:${options?.label ?? 'default'}:${transaction.id}`)
    try {
      const result = await execute(transaction)
      this.events.push(`commit:${transaction.id}`)
      return result
    } catch (error) {
      this.events.push(`rollback:${transaction.id}`)
      throw error
    }
  }

  protected async createSavepoint<TResult>(
    _transaction: FakeClient,
    options: FakeSpec['savepointOptions'] | undefined,
    execute: (transaction: FakeClient) => Promise<TResult>,
  ): Promise<TResult> {
    const transaction = { kind: 'transaction', id: ++this.#sequence } as const
    this.events.push(`savepoint:${options?.label ?? 'default'}:${transaction.id}`)
    try {
      const result = await execute(transaction)
      this.events.push(`release:${transaction.id}`)
      return result
    } catch (error) {
      this.events.push(`rollback-savepoint:${transaction.id}`)
      throw error
    }
  }
}

const terminal: TerminalLayerDescriptor<'test'> = {
  kind: 'terminal',
  name: 'test.handler',
  role: 'terminal',
  protocol: 'test',
}

describe('@loutrejs/database', () => {
  it('Lifecycle前後のclient状態を管理する', async () => {
    const database = new FakeDatabase()
    expect(() => database.client).toThrow('LUTRE_DB_NOT_READY')

    await database.onModuleInit()
    expect(database.client).toEqual({ kind: 'root', id: 1 })

    await database.onModuleDestroy()
    expect(database.events).toEqual(['connect', 'disconnect:1'])
    expect(() => database.client).toThrow('LUTRE_DB_NOT_READY')
  })

  it('root transactionでambient clientをawait越しに維持して終了後に戻す', async () => {
    const database = new FakeDatabase()
    await database.onModuleInit()
    const root = database.client

    const result = await database.withTransaction(async () => {
      const transactionClient = database.client
      await Promise.resolve()
      expect(database.client).toBe(transactionClient)
      expect(transactionClient.kind).toBe('transaction')
      return 'done'
    }, { options: { begin: { label: 'root' } } })

    expect(result).toBe('done')
    expect(database.client).toBe(root)
    expect(database.events).toEqual([
      'connect',
      'begin:root:2',
      'commit:2',
    ])
  })

  it('errorをrollbackして元errorを再throwする', async () => {
    const database = new FakeDatabase()
    const failure = new Error('失敗')
    await database.onModuleInit()

    await expect(database.withTransaction(async () => {
      throw failure
    })).rejects.toBe(failure)
    expect(database.events).toEqual(['connect', 'begin:default:2', 'rollback:2'])
  })

  it('nested requiredはjoinしinner begin optionsを適用しない', async () => {
    const database = new FakeDatabase()
    await database.onModuleInit()

    await database.withTransaction(async () => {
      const outer = database.client
      await database.withTransaction(
        () => expect(database.client).toBe(outer),
        { options: { begin: { label: 'inner' } } },
      )
    }, { options: { begin: { label: 'outer' } } })

    expect(database.events).toEqual(['connect', 'begin:outer:2', 'commit:2'])
  })

  it('nested savepointとroot savepointでphysical operation別optionを使う', async () => {
    const nested = new FakeDatabase()
    await nested.onModuleInit()
    await nested.withTransaction(async () => {
      await nested.withTransaction(
        () => undefined,
        {
          propagation: 'savepoint',
          options: {
            begin: { label: 'unused' },
            savepoint: { label: 'nested' },
          },
        },
      )
    })
    expect(nested.events).toEqual([
      'connect',
      'begin:default:2',
      'savepoint:nested:3',
      'release:3',
      'commit:2',
    ])

    const root = new FakeDatabase()
    await root.onModuleInit()
    await root.withTransaction(
      () => undefined,
      {
        propagation: 'savepoint',
        options: {
          begin: { label: 'root-savepoint' },
          savepoint: { label: 'unused' },
        },
      },
    )
    expect(root.events).toEqual([
      'connect',
      'begin:root-savepoint:2',
      'commit:2',
    ])
  })

  it('concurrent executionのambient clientを分離する', async () => {
    const database = new FakeDatabase()
    await database.onModuleInit()
    const seen: FakeClient[] = []
    let releaseFirst: (() => void) | undefined
    let firstStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => { firstStarted = resolve })
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve })

    const first = database.withTransaction(async () => {
      const client = database.client
      seen.push(client)
      firstStarted?.()
      await gate
      expect(database.client).toBe(client)
    })
    await started
    const second = database.withTransaction(async () => {
      const client = database.client
      seen.push(client)
      await Promise.resolve()
      expect(database.client).toBe(client)
    })
    await second
    releaseFirst?.()
    await first

    expect(seen).toHaveLength(2)
    expect(seen[0]).not.toBe(seen[1])
  })

  it('DatabaseService instanceごとにambient stateを分離する', async () => {
    const primary = new FakeDatabase()
    const analytics = new FakeDatabase()
    await Promise.all([primary.onModuleInit(), analytics.onModuleInit()])

    await primary.withTransaction(async () => {
      expect(primary.client.kind).toBe('transaction')
      expect(analytics.client.kind).toBe('root')
      await analytics.withTransaction(async () => {
        expect(primary.client.kind).toBe('transaction')
        expect(analytics.client.kind).toBe('transaction')
      })
    })
  })

  it('transaction Layerがprogrammatic APIと同じsemanticsを使う', async () => {
    const database = new FakeDatabase()
    const DATABASE = token<FakeDatabase>('database.layer')
    await database.onModuleInit()
    const transactionLayer = transaction({
      database: DATABASE,
      options: { begin: { label: 'layer' } },
      pipeline: [terminal],
    })
    const container = new Container([provide(DATABASE).useValue(database)])

    const result = await executePipeline([transactionLayer], {
      context: {},
      resolve: (candidate) => container.resolve(candidate),
      validate: () => undefined,
      terminal: () => {
        expect(database.client.kind).toBe('transaction')
        return 'done'
      },
    })

    expect(result).toBe('done')
    expect(database.events).toEqual(['connect', 'begin:layer:2', 'commit:2'])
  })

  it('transaction内shortCircuitを正常結果としてcommitする', async () => {
    const database = new FakeDatabase()
    const DATABASE = token<FakeDatabase>('database.short-circuit')
    await database.onModuleInit()
    const cached = layer({
      name: 'cached',
      inbound: () => shortCircuit('cached-result'),
    })
    const transactionLayer = transaction({
      database: DATABASE,
      pipeline: [cached],
    })
    const container = new Container([provide(DATABASE).useValue(database)])

    await expect(executePipeline([transactionLayer, terminal], {
      context: {},
      resolve: (candidate) => container.resolve(candidate),
      validate: () => undefined,
      terminal: () => 'unreachable',
    })).resolves.toBe('cached-result')
    expect(database.events).toEqual(['connect', 'begin:default:2', 'commit:2'])
  })

  it('Pipeline savepoint errorをouterへ再throwして両方rollbackする', async () => {
    const database = new FakeDatabase()
    const DATABASE = token<FakeDatabase>('database.savepoint-error')
    const failure = new Error('savepoint failure')
    await database.onModuleInit()
    const broken = layer({
      name: 'broken',
      inbound: () => { throw failure },
    })
    const outer = transaction({
      database: DATABASE,
      pipeline: [
        transaction({
          database: DATABASE,
          propagation: 'savepoint',
          pipeline: [broken],
        }),
        terminal,
      ],
    })
    const container = new Container([provide(DATABASE).useValue(database)])

    await expect(executePipeline([outer], {
      context: {},
      resolve: (candidate) => container.resolve(candidate),
      validate: () => undefined,
      terminal: () => 'unreachable',
    })).rejects.toBe(failure)
    expect(database.events).toEqual([
      'connect',
      'begin:default:2',
      'savepoint:default:3',
      'rollback-savepoint:3',
      'rollback:2',
    ])
  })

  it('sync valueとPromise resultの両方を返せる', async () => {
    const database = new FakeDatabase()
    await database.onModuleInit()
    await expect(database.withTransaction(() => 1)).resolves.toBe(1)
    await expect(database.withTransaction(() => Promise.resolve(2))).resolves.toBe(2)
  })

  it('unsupported capabilityをfail-fastする', async () => {
    interface UnsupportedSpec extends DatabaseAdapterSpec {
      readonly client: FakeClient
      readonly transactionClient: FakeClient
      readonly beginOptions: never
      readonly savepointOptions: never
      readonly capabilities: {
        readonly transactions: false
        readonly savepoints: false
      }
    }
    class UnsupportedDatabase extends DatabaseService<UnsupportedSpec> {
      protected readonly transactionCapabilities = {
        transactions: false,
        savepoints: false,
      } as const
      protected connect(): FakeClient { return { kind: 'root', id: 1 } }
      protected disconnect(): void {}
    }
    const database = new UnsupportedDatabase()
    await database.onModuleInit()
    await expect(database.withTransaction(() => undefined)).rejects.toEqual(
      new DatabaseError('LUTRE_DB_TRANSACTION_UNSUPPORTED'),
    )

    interface UnsupportedSavepointSpec extends DatabaseAdapterSpec {
      readonly client: FakeClient
      readonly transactionClient: FakeClient
      readonly beginOptions: never
      readonly savepointOptions: never
      readonly capabilities: {
        readonly transactions: true
        readonly savepoints: boolean
      }
    }
    class UnsupportedSavepointDatabase extends DatabaseService<UnsupportedSavepointSpec> {
      protected readonly transactionCapabilities = {
        transactions: true,
        savepoints: false,
      } as const
      protected connect(): FakeClient { return { kind: 'root', id: 1 } }
      protected disconnect(): void {}
      protected async beginTransaction<TResult>(
        _client: FakeClient,
        _options: undefined,
        execute: (transaction: FakeClient) => Promise<TResult>,
      ): Promise<TResult> {
        return await execute({ kind: 'transaction', id: 2 })
      }
    }
    const noSavepoint = new UnsupportedSavepointDatabase()
    await noSavepoint.onModuleInit()
    await expect(noSavepoint.withTransaction(
      () => noSavepoint.withTransaction(
        () => undefined,
        { propagation: 'savepoint' },
      ),
    )).rejects.toEqual(new DatabaseError('LUTRE_DB_SAVEPOINT_UNSUPPORTED'))
  })
})
