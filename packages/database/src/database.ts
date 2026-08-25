import { AsyncLocalStorage } from 'node:async_hooks'
import type { OnModuleDestroy, OnModuleInit } from '@loutrejs/core'

export interface DatabaseAdapterSpec {
  readonly client: unknown
  readonly transactionClient: unknown
  readonly beginOptions: unknown
  readonly savepointOptions: unknown
  readonly capabilities: {
    readonly transactions: boolean
    readonly savepoints: boolean
  }
}

export type TransactionPropagation = 'required' | 'savepoint'

export type TransactionPropagationForSpec<
  TSpec extends DatabaseAdapterSpec,
> = TSpec['capabilities']['savepoints'] extends false
  ? 'required'
  : TransactionPropagation

type OptionProperty<TKey extends PropertyKey, TValue> = [TValue] extends [never]
  ? {}
  : { readonly [TProperty in TKey]?: TValue }

export type DatabaseTransactionPhysicalOptions<
  TSpec extends DatabaseAdapterSpec,
  TPropagation extends TransactionPropagationForSpec<TSpec>,
> = OptionProperty<'begin', TSpec['beginOptions']> & (
  TPropagation extends 'savepoint'
    ? OptionProperty<'savepoint', TSpec['savepointOptions']>
    : {}
)

export interface DatabaseTransactionRuntimeDefinition<
  TSpec extends DatabaseAdapterSpec,
  TPropagation extends TransactionPropagationForSpec<TSpec>,
> {
  readonly propagation?: TPropagation
  readonly options?: DatabaseTransactionPhysicalOptions<TSpec, TPropagation>
}

export class DatabaseError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'DatabaseError'
  }
}

export abstract class DatabaseService<
  TSpec extends DatabaseAdapterSpec,
> implements OnModuleInit, OnModuleDestroy {
  declare readonly '~databaseSpec': TSpec

  readonly #transactionStorage =
    new AsyncLocalStorage<TSpec['transactionClient']>()
  #rootClient: TSpec['client'] | undefined

  protected abstract readonly transactionCapabilities: TSpec['capabilities']

  get client(): TSpec['client'] | TSpec['transactionClient'] {
    const transaction = this.#transactionStorage.getStore()
    if (transaction !== undefined) return transaction
    return this.requireRootClient()
  }

  async onModuleInit(): Promise<void> {
    if (this.#rootClient !== undefined) return
    this.#rootClient = await this.connect()
  }

  async onModuleDestroy(): Promise<void> {
    const client = this.#rootClient
    this.#rootClient = undefined
    if (client !== undefined) await this.disconnect(client)
  }

  async withTransaction<
    TResult,
    const TPropagation extends TransactionPropagationForSpec<TSpec> = 'required',
  >(
    callback: () => TResult | Promise<TResult>,
    definition?: DatabaseTransactionRuntimeDefinition<TSpec, TPropagation>,
  ): Promise<TResult> {
    if (!this.transactionCapabilities.transactions) {
      throw new DatabaseError('LUTRE_DB_TRANSACTION_UNSUPPORTED')
    }

    const propagation = definition?.propagation ?? 'required'
    const options = definition?.options as
      | {
          readonly begin?: TSpec['beginOptions']
          readonly savepoint?: TSpec['savepointOptions']
        }
      | undefined
    const current = this.#transactionStorage.getStore()

    if (current !== undefined) {
      if (propagation === 'required') return await callback()
      if (!this.transactionCapabilities.savepoints) {
        throw new DatabaseError('LUTRE_DB_SAVEPOINT_UNSUPPORTED')
      }
      return await this.createSavepoint(
        current,
        options?.savepoint,
        (transaction) => this.#transactionStorage.run(
          transaction,
          async () => await callback(),
        ),
      )
    }

    const root = this.requireRootClient()
    return await this.beginTransaction(
      root,
      options?.begin,
      (transaction) => this.#transactionStorage.run(
        transaction,
        async () => await callback(),
      ),
    )
  }

  protected abstract connect():
    | TSpec['client']
    | Promise<TSpec['client']>

  protected abstract disconnect(
    client: TSpec['client'],
  ): void | Promise<void>

  protected beginTransaction<TResult>(
    _client: TSpec['client'],
    _options: TSpec['beginOptions'] | undefined,
    _execute: (
      transaction: TSpec['transactionClient'],
    ) => Promise<TResult>,
  ): Promise<TResult> {
    throw new DatabaseError('LUTRE_DB_TRANSACTION_UNSUPPORTED')
  }

  protected createSavepoint<TResult>(
    _transaction: TSpec['transactionClient'],
    _options: TSpec['savepointOptions'] | undefined,
    _execute: (
      transaction: TSpec['transactionClient'],
    ) => Promise<TResult>,
  ): Promise<TResult> {
    throw new DatabaseError('LUTRE_DB_SAVEPOINT_UNSUPPORTED')
  }

  private requireRootClient(): TSpec['client'] {
    if (this.#rootClient === undefined) {
      throw new DatabaseError('LUTRE_DB_NOT_READY')
    }
    return this.#rootClient
  }
}
