import {
  DatabaseService,
  type DatabaseAdapterSpec,
} from '@loutrejs/database'

interface ConformanceClient {
  readonly kind: 'root' | 'transaction'
}

interface ConformanceSpec extends DatabaseAdapterSpec {
  readonly client: ConformanceClient
  readonly transactionClient: ConformanceClient
  readonly beginOptions: never
  readonly savepointOptions: never
  readonly capabilities: {
    readonly transactions: true
    readonly savepoints: false
  }
}

class ConformanceDatabase extends DatabaseService<ConformanceSpec> {
  protected readonly transactionCapabilities = {
    transactions: true,
    savepoints: false,
  } as const

  protected connect(): ConformanceClient {
    return { kind: 'root' }
  }

  protected disconnect(): void {}

  protected async beginTransaction<TResult>(
    _client: ConformanceClient,
    _options: undefined,
    execute: (transaction: ConformanceClient) => Promise<TResult>,
  ): Promise<TResult> {
    return await execute({ kind: 'transaction' })
  }
}

export async function runDatabaseConformance(): Promise<void> {
  const database = new ConformanceDatabase()
  await database.onModuleInit()
  const root = database.client
  await database.withTransaction(async () => {
    const transaction = database.client
    if (transaction.kind !== 'transaction') {
      throw new Error('transaction clientへ切り替わりませんでした')
    }
    await Promise.resolve()
    if (database.client !== transaction) {
      throw new Error('await後にambient transaction clientが失われました')
    }
  })
  if (database.client !== root) {
    throw new Error('transaction終了後にroot clientへ戻りませんでした')
  }
  await database.onModuleDestroy()
}
