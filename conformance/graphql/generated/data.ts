// @generated loutre graphql generateの出力です。直接編集しないでください。
// 入力指紋: cf90e99265a2c18b6472caacadf5ec71c01e740b310b7e3c69ec5128b423eb8b
import { createSchemaData } from '@loutrejs/graphql/data'
import type { SchemaFields } from './types.js'
export const createData = () =>
  createSchemaData<SchemaFields>(
    {
      Mutation: {
        update: 'Mutation.update',
      },
      Query: {
        at: 'Query.at',
        cleanupCount: 'Query.cleanupCount',
        hello: 'Query.hello',
        nullableTicks: 'Query.nullableTicks',
      },
      Subscription: {
        ticks: 'Subscription.ticks',
      },
      Tick: {
        hidden: 'Tick.hidden',
        sequence: 'Tick.sequence',
      },
    },
    'cf90e99265a2c18b6472caacadf5ec71c01e740b310b7e3c69ec5128b423eb8b',
  )
