import {
  layer,
  type CompositeLayerDescriptor,
  type PipelineItem,
  type TokenLike,
  type TokenValue,
} from '@loutrejs/core'
import {
  DatabaseService,
  type DatabaseAdapterSpec,
  type DatabaseTransactionPhysicalOptions,
  type TransactionPropagationForSpec,
} from './database.js'

export type DatabaseToken = TokenLike<DatabaseService<DatabaseAdapterSpec>>

export type DatabaseSpecOf<TDatabase extends TokenLike> =
  TokenValue<TDatabase> extends DatabaseService<infer TSpec>
    ? TSpec
    : never

export type TransactionPropagationOf<
  TDatabase extends DatabaseToken,
> = TransactionPropagationForSpec<DatabaseSpecOf<TDatabase>>

export type TransactionPhysicalOptions<
  TDatabase extends DatabaseToken,
  TPropagation extends TransactionPropagationOf<TDatabase>,
> = DatabaseTransactionPhysicalOptions<
  DatabaseSpecOf<TDatabase>,
  TPropagation
>

type TransactionCapableToken<TDatabase extends DatabaseToken> =
  DatabaseSpecOf<TDatabase>['capabilities']['transactions'] extends false
    ? never
    : TDatabase

export interface TransactionDefinition<
  TDatabase extends DatabaseToken,
  TPropagation extends TransactionPropagationOf<TDatabase>,
  TPipeline extends readonly PipelineItem[],
> {
  readonly database: TransactionCapableToken<TDatabase>
  readonly propagation?: TPropagation
  readonly options?: TransactionPhysicalOptions<TDatabase, TPropagation>
  readonly pipeline: TPipeline
}

type TransactionInjection<TDatabase extends DatabaseToken> = readonly [{
  readonly token: TDatabase
  readonly scope: 'application'
}]

export function transaction<
  const TDatabase extends DatabaseToken,
  const TPropagation extends TransactionPropagationOf<NoInfer<TDatabase>> = 'required',
  const TPipeline extends readonly PipelineItem[] = readonly PipelineItem[],
>(
  definition: TransactionDefinition<
    TDatabase,
    TPropagation,
    TPipeline
  >,
): CompositeLayerDescriptor<
  TPipeline,
  TransactionInjection<TDatabase>,
  unknown,
  'database.transaction',
  'generic'
> {
  const propagation = definition.propagation ?? 'required'
  return layer.compose({
    name: 'database.transaction',
    role: 'generic',
    inject: [
      {
        token: definition.database,
        scope: 'application',
      },
    ],
    pipeline: definition.pipeline,
    scope: (_context, database) => ({
      run: async (execute) => {
        await database.withTransaction(execute, {
          propagation,
          ...(definition.options === undefined
            ? {}
            : { options: definition.options }),
        })
      },
    }),
    graph: {
      attributes: {
        propagation,
        beginOptions:
          definition.options !== undefined &&
          'begin' in definition.options &&
          definition.options.begin !== undefined
            ? 'configured'
            : 'default',
        savepointOptions:
          propagation !== 'savepoint'
            ? 'n/a'
            : 'savepoint' in (definition.options ?? {})
              ? 'configured'
              : 'default',
      },
    },
  })
}
