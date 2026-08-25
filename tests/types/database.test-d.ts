import { contextKey, layer, shortCircuit, token } from '@loutrejs/core'
import {
  DatabaseService,
  transaction,
  type DatabaseAdapterSpec,
} from '@loutrejs/database'
import { http, validate, type ContextOf, type ControllerOf } from '@loutrejs/http'
import { contract, procedure } from '@loutrejs/core'
import { z } from 'zod'

interface PrismaClient {
  readonly adapter: 'prisma'
}
interface PrismaTransactionClient {
  readonly adapter: 'prisma-transaction'
}
// Prisma 7.9.1のgenerated callback型とPrisma.TransactionClientでnested
// $transactionがcompileすることを一時spikeで確認し、Public dependencyはstructural型に留める。
interface PrismaSpec extends DatabaseAdapterSpec {
  readonly client: PrismaClient
  readonly transactionClient: PrismaTransactionClient
  readonly beginOptions: {
    readonly isolationLevel?: 'Serializable' | 'ReadCommitted'
    readonly maxWait?: number
    readonly timeout?: number
  }
  readonly savepointOptions: never
  readonly capabilities: {
    readonly transactions: true
    readonly savepoints: true
  }
}

interface DrizzleClient {
  readonly adapter: 'drizzle'
}
interface DrizzleTransaction {
  readonly adapter: 'drizzle-transaction'
}
// Drizzle 0.45.2のNodePg transaction configとnested transactionを一時spikeで確認済み。
interface DrizzleSpec extends DatabaseAdapterSpec {
  readonly client: DrizzleClient
  readonly transactionClient: DrizzleTransaction
  readonly beginOptions: {
    readonly isolationLevel?:
      | 'read uncommitted'
      | 'read committed'
      | 'repeatable read'
      | 'serializable'
    readonly accessMode?: 'read only' | 'read write'
    readonly deferrable?: boolean
  }
  readonly savepointOptions: never
  readonly capabilities: {
    readonly transactions: true
    readonly savepoints: true
  }
}

abstract class PrismaDatabase extends DatabaseService<PrismaSpec> {}
abstract class DrizzleDatabase extends DatabaseService<DrizzleSpec> {}

const authentication = layer({ name: 'authentication' })
const authorization = layer({ name: 'authorization' })

const prismaTransaction = transaction({
  database: PrismaDatabase,
  options: {
    begin: {
      isolationLevel: 'Serializable',
      maxWait: 5_000,
      timeout: 10_000,
    },
  },
  pipeline: [authentication, authorization],
})
const firstPrismaLayer: typeof authentication = prismaTransaction.pipeline[0]
void firstPrismaLayer

const nestedTransaction = transaction({
  database: PrismaDatabase,
  pipeline: [
    authorization,
    transaction({
      database: PrismaDatabase,
      propagation: 'savepoint',
      pipeline: [authentication],
    }),
  ],
})
const nestedLayer = nestedTransaction.pipeline[1]
const nestedFirst: typeof authentication = nestedLayer.pipeline[0]
void nestedFirst

const PRIMARY_DATABASE = token<PrismaDatabase>('database.primary')
transaction({
  database: PRIMARY_DATABASE,
  options: { begin: { maxWait: 1_000 } },
  pipeline: [authentication],
})

transaction({
  database: PrismaDatabase,
  options: {
    begin: {
      // @ts-expect-error Prisma begin optionへDrizzle固有fieldは指定できない
      accessMode: 'read only',
    },
  },
  pipeline: [],
})

transaction({
  database: DrizzleDatabase,
  options: {
    begin: {
      // @ts-expect-error Drizzle begin optionへPrisma固有fieldは指定できない
      maxWait: 1_000,
    },
  },
  pipeline: [],
})

transaction({
  database: PrismaDatabase,
  propagation: 'savepoint',
  options: {
    // @ts-expect-error savepointOptions: neverではsavepoint optionを指定できない
    savepoint: {},
  },
  pipeline: [],
})

transaction({
  database: DrizzleDatabase,
  options: {
    // @ts-expect-error required propagationではsavepoint optionを指定できない
    savepoint: {},
  },
  pipeline: [],
})

interface NoSavepointSpec extends DatabaseAdapterSpec {
  readonly client: {}
  readonly transactionClient: {}
  readonly beginOptions: {}
  readonly savepointOptions: never
  readonly capabilities: {
    readonly transactions: true
    readonly savepoints: false
  }
}
abstract class NoSavepointDatabase extends DatabaseService<NoSavepointSpec> {}
transaction({
  database: NoSavepointDatabase,
  // @ts-expect-error savepoints: falseではsavepoint propagationを指定できない
  propagation: 'savepoint',
  pipeline: [],
})

interface NoTransactionSpec extends DatabaseAdapterSpec {
  readonly client: {}
  readonly transactionClient: never
  readonly beginOptions: never
  readonly savepointOptions: never
  readonly capabilities: {
    readonly transactions: false
    readonly savepoints: false
  }
}
abstract class NoTransactionDatabase extends DatabaseService<NoTransactionSpec> {}
transaction({
  // @ts-expect-error transactions: falseのDatabaseはtransaction Layerに使えない
  database: NoTransactionDatabase,
  pipeline: [],
})

const CURRENT_USER = contextKey('currentUser').of<{ readonly id: string }>()
const provideUser = layer({
  name: 'provide-user',
  provides: [CURRENT_USER],
  inbound: () => ({ currentUser: { id: 'user-1' } }),
})
const Body = z.object({ name: z.string() })
const ResponseBody = z.object({ ok: z.boolean() })

const RecursiveContract = contract({
  create: procedure({
    protocols: {
      http: http({
        method: 'POST',
        path: '/users',
        request: { body: Body },
        responses: { ok: { status: 200, body: ResponseBody } },
        pipeline: [
          transaction({
            database: PrismaDatabase,
            pipeline: [provideUser, validate.body],
          }),
          http.controller,
        ],
      }),
    },
  }),
})
type RecursiveController = ControllerOf<typeof RecursiveContract, 'http'>
type RecursiveContext = ContextOf<RecursiveController, 'create'>
declare const recursiveContext: RecursiveContext
const userId: string = recursiveContext.currentUser.id
const bodyName: string = recursiveContext.body.name
void userId
void bodyName

const TerminalContract = contract({
  create: procedure({
    protocols: {
      http: http({
        method: 'POST',
        path: '/terminal',
        request: { body: Body },
        responses: { ok: { status: 200, body: ResponseBody } },
        pipeline: [
          transaction({
            database: PrismaDatabase,
            pipeline: [validate.body, http.controller],
          }),
        ],
      }),
    },
  }),
})
type TerminalController = ControllerOf<typeof TerminalContract, 'http'>
type TerminalContext = ContextOf<TerminalController, 'create'>
declare const terminalContext: TerminalContext
const nestedBodyName: string = terminalContext.body.name
void nestedBodyName

const invalidShortCircuit = layer<
  readonly [],
  readonly [],
  unknown,
  void,
  { readonly kind: 'http-result', readonly variant: 'missing', readonly body: {} }
>({
  name: 'invalid-short-circuit',
  inbound: () => shortCircuit({
    kind: 'http-result',
    variant: 'missing',
    body: {},
  }),
})

http({
  method: 'GET',
  path: '/invalid-short-circuit',
  responses: { ok: { status: 200, body: ResponseBody } },
  // @ts-expect-error Composite childのshortCircuit resultもresponse宣言と照合する
  pipeline: [transaction({ database: PrismaDatabase, pipeline: [invalidShortCircuit] }), http.controller],
})
